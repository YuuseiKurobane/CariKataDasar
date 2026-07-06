import {readFile, rename, writeFile} from 'node:fs/promises';
import {promisify} from 'node:util';
import {gunzip} from 'node:zlib';

const REGRESSION_CASE_HEADER = ['token', 'expected_result'];
const REQUIRED_CASE_DUMP_COLUMNS = ['token', 'expected_result'];
const FREQUENCY_HEADER = ['token', 'occurrences'];
const REVIEW_BATCH_HEADER = [
    'token',
    'occurrences',
    'expected_result',
    'is_interesting',
];
const DISABLED_VALUES = new Set(['0', 'disabled', 'false', 'n', 'no', 'off']);
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

function assertCaseDumpHeader(header, filePath) {
    for (const requiredColumn of REQUIRED_CASE_DUMP_COLUMNS) {
        const occurrenceCount = header.filter(
            (column) => column === requiredColumn,
        ).length;
        if (occurrenceCount !== 1) {
            throw new Error(
                `${filePath} must contain exactly one ${requiredColumn} column`,
            );
        }
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

function rowsToCaseDumpRecords(rows, header, filePath) {
    const tokenIndex = header.indexOf('token');
    const expectedResultIndex = header.indexOf('expected_result');
    const enabledIndex = header.indexOf('enabled');
    const records = [];

    for (const [index, row] of rows.entries()) {
        if (row.every((value) => value.trim().length === 0)) {
            continue;
        }
        if (row.length > header.length) {
            throw new Error(
                `${filePath}:${index + 2}: expected at most ${header.length} columns, got ${row.length}`,
            );
        }

        const token = (row[tokenIndex] ?? '').trim();
        const expectedResult = (row[expectedResultIndex] ?? '').trim();
        const enabled = (row[enabledIndex] ?? '').trim().toLowerCase();
        if (
            token.length === 0
            || expectedResult.length === 0
            || DISABLED_VALUES.has(enabled)
        ) {
            continue;
        }

        records.push({
            token,
            expected_result: expectedResult,
        });
    }

    return records;
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

export async function loadCaseDumpCsv(filePath) {
    const contents = await readFile(filePath, 'utf8');
    const rows = parseCsv(contents);
    if (rows.length === 0) {
        throw new Error(`Empty CSV file: ${filePath}`);
    }

    const [header, ...bodyRows] = rows;
    assertCaseDumpHeader(header, filePath);
    return rowsToCaseDumpRecords(bodyRows, header, filePath);
}

async function writeCsvAtomic(filePath, header, records) {
    const temporaryPath = `${filePath}.tmp-${process.pid}`;
    await writeFile(temporaryPath, serializeCsv(header, records), 'utf8');
    await rename(temporaryPath, filePath);
}

export async function loadRegressionCaseCsv(filePath) {
    return loadCsvObjects(filePath, REGRESSION_CASE_HEADER);
}

export async function loadFrequencyCsv(filePath) {
    return loadCsvObjects(filePath, FREQUENCY_HEADER);
}

export async function loadReviewBatchCsv(filePath) {
    return loadCsvObjects(filePath, REVIEW_BATCH_HEADER);
}

export async function writeRegressionCaseCsv(filePath, records) {
    await writeCsvAtomic(filePath, REGRESSION_CASE_HEADER, records);
}

export async function writeReviewBatchCsv(filePath, records) {
    await writeCsvAtomic(filePath, REVIEW_BATCH_HEADER, records);
}
