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

export async function loadParserCaseFile(filePath) {
    const contents = await readFile(filePath, 'utf8');
    const records = [];
    const lines = contents.split(/\r\n?|\n/u);

    for (const [index, line] of lines.entries()) {
        if (line.trim().length === 0) {
            continue;
        }

        const words = line.split(',').map((word) => word.trim());
        if (words.some((word) => word.length === 0)) {
            throw new Error(
                `${filePath}:${index + 1}: parser case entries must be non-empty`,
            );
        }

        const [token, ...hits] = words;
        records.push({token, hits});
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
    const lines = records.map(({token, hits}) => [token, ...hits].join(', '));
    const contents = lines.length === 0 ? '' : `${lines.join('\n')}\n`;
    await writeTextAtomic(filePath, contents);
}

export async function writeReviewBatchCsv(filePath, records) {
    await writeCsvAtomic(filePath, REVIEW_BATCH_HEADER, records);
}
