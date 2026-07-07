import {readFile, rename, writeFile} from 'node:fs/promises';
import {promisify} from 'node:util';
import {gunzip} from 'node:zlib';

const FREQUENCY_HEADER = ['token', 'occurrences'];
const REVIEW_BATCH_HEADER = [
    'token',
    'occurrences',
    'expected_result',
    'is_interesting',
];
const gunzipAsync = promisify(gunzip);

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];

        if (inQuotes) {
            if (character === '"') {
                if (text[index + 1] === '"') {
                    field += '"';
                    index += 1;
                } else {
                    inQuotes = false;
                }
            } else {
                field += character;
            }
            continue;
        }

        if (character === '"') {
            inQuotes = true;
        } else if (character === ',') {
            row.push(field);
            field = '';
        } else if (character === '\n') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else if (character === '\r') {
            if (text[index + 1] === '\n') {
                index += 1;
            }
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += character;
        }
    }

    if (inQuotes) {
        throw new Error('CSV parse error: unterminated quoted field');
    }

    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    return rows;
}

function formatHeader(header) {
    return header.join(',');
}

function assertHeader(actualHeader, expectedHeader, filePath) {
    if (
        actualHeader.length !== expectedHeader.length
        || actualHeader.some((value, index) => value !== expectedHeader[index])
    ) {
        throw new Error(
            `${filePath} has header ${formatHeader(actualHeader)}; expected ${formatHeader(expectedHeader)}`,
        );
    }
}

function rowsToObjects(rows, header, filePath) {
    return rows.map((row, index) => {
        if (row.length !== header.length) {
            throw new Error(
                `${filePath}:${index + 2}: expected ${header.length} columns, got ${row.length}`,
            );
        }
        return Object.fromEntries(header.map((column, columnIndex) => [column, row[columnIndex]]));
    });
}

function escapeCsvField(value) {
    const stringValue = String(value);
    if (!/[",\r\n]/u.test(stringValue)) {
        return stringValue;
    }
    return `"${stringValue.replaceAll('"', '""')}"`;
}

function serializeCsv(header, records) {
    const lines = [header.map(escapeCsvField).join(',')];
    for (const record of records) {
        lines.push(header.map((column) => escapeCsvField(record[column] ?? '')).join(','));
    }
    return `${lines.join('\n')}\n`;
}

async function loadCsvObjects(filePath, expectedHeader) {
    const contents = await readFile(filePath);
    const text = filePath.endsWith('.gz')
        ? (await gunzipAsync(contents)).toString('utf8')
        : contents.toString('utf8');
    const rows = parseCsv(text);
    if (rows.length === 0) {
        throw new Error(`Empty CSV file: ${filePath}`);
    }
    const [header, ...bodyRows] = rows;
    assertHeader(header, expectedHeader, filePath);
    return rowsToObjects(bodyRows, expectedHeader, filePath);
}

function syntaxError(filePath, lineNumber, message) {
    throw new Error(`${filePath}:${lineNumber}: Syntax Error: ${message}`);
}

function splitParserCaseLine(line, filePath, lineNumber) {
    const entries = [];
    let entry = '';
    let depth = 0;

    for (const character of line) {
        if (character === '(') {
            if (depth !== 0) {
                syntaxError(filePath, lineNumber, 'nested fuzzy tail brackets are not supported');
            }
            depth = 1;
            entry += character;
            continue;
        }

        if (character === ')') {
            if (depth !== 1) {
                syntaxError(filePath, lineNumber, 'unmatched fuzzy tail bracket');
            }
            depth = 0;
            entry += character;
            continue;
        }

        if (character === ',' && depth === 0) {
            entries.push(entry.trim());
            entry = '';
            continue;
        }

        entry += character;
    }

    if (depth !== 0) {
        syntaxError(filePath, lineNumber, 'unterminated fuzzy tail bracket');
    }

    entries.push(entry.trim());
    return entries;
}

function parseFuzzyTail(entry, filePath, lineNumber) {
    const inner = entry.slice(1, -1).trim();
    if (inner.length === 0) {
        syntaxError(filePath, lineNumber, 'fuzzy tail must contain at least one entry');
    }

    const fuzzyTailHits = inner.split(',').map((word) => word.trim());
    if (fuzzyTailHits.some((word) => word.length === 0)) {
        syntaxError(filePath, lineNumber, 'fuzzy tail entries must be non-empty');
    }
    if (fuzzyTailHits.some((word) => /[()]/u.test(word))) {
        syntaxError(filePath, lineNumber, 'nested fuzzy tail brackets are not supported');
    }

    return fuzzyTailHits;
}

function parseParserCaseLine(line, filePath, lineNumber) {
    const entries = splitParserCaseLine(line, filePath, lineNumber);
    if (entries.some((word) => word.length === 0)) {
        throw new Error(
            `${filePath}:${lineNumber}: parser case entries must be non-empty`,
        );
    }

    const lastEntry = entries.at(-1);
    const hasFuzzyTail = /^\([^()]*\)$/u.test(lastEntry);
    const fuzzyTailHits = hasFuzzyTail
        ? parseFuzzyTail(lastEntry, filePath, lineNumber)
        : [];
    const strictEntries = hasFuzzyTail ? entries.slice(0, -1) : entries;

    if (strictEntries.some((word) => /[()]/u.test(word))) {
        syntaxError(filePath, lineNumber, 'fuzzy tail brackets are only allowed at the end');
    }

    const [token, ...prefixHits] = strictEntries;
    return {token, prefixHits, fuzzyTailHits};
}

export async function loadParserCaseFile(filePath) {
    const contents = await readFile(filePath, 'utf8');
    const records = [];
    const lines = contents.split(/\r\n?|\n/u);

    for (const [index, line] of lines.entries()) {
        if (line.trim().length === 0) {
            continue;
        }

        records.push(parseParserCaseLine(line, filePath, index + 1));
    }

    return records;
}

async function writeTextAtomic(filePath, contents) {
    const temporaryPath = `${filePath}.tmp-${process.pid}`;
    await writeFile(temporaryPath, contents, 'utf8');
    await rename(temporaryPath, filePath);
}

async function writeCsvAtomic(filePath, header, records) {
    await writeTextAtomic(filePath, serializeCsv(header, records));
}

export async function loadFrequencyCsv(filePath) {
    return loadCsvObjects(filePath, FREQUENCY_HEADER);
}

export async function loadReviewBatchCsv(filePath) {
    return loadCsvObjects(filePath, REVIEW_BATCH_HEADER);
}

export async function writeParserCaseFile(filePath, records) {
    const lines = records.map(({token, prefixHits, fuzzyTailHits = []}) => {
        const entries = [token, ...prefixHits];
        if (fuzzyTailHits.length > 0) {
            entries.push(`(${fuzzyTailHits.join(', ')})`);
        }
        return entries.join(', ');
    });
    const contents = lines.length === 0 ? '' : `${lines.join('\n')}\n`;
    await writeTextAtomic(filePath, contents);
}

export async function writeReviewBatchCsv(filePath, records) {
    await writeCsvAtomic(filePath, REVIEW_BATCH_HEADER, records);
}
