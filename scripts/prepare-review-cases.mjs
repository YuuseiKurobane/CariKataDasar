import {mkdir, readdir, unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
    loadFrequencyCsv,
    writeReviewBatchCsv,
} from '../src/case-files.js';
import {loadHeadwordIndex} from '../src/headword-index.js';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cleanedFrequencyPath = path.join(
    repositoryRoot,
    'data',
    'frequency',
    'cleaned_token_frequencies.csv.gz',
);
const headwordSourceDirectory = path.join(
    repositoryRoot,
    'data',
    'headwords',
    'sources',
);
const reviewRoot = path.join(repositoryRoot, 'data', 'review');
const reviewSeedPath = path.join(reviewRoot, 'corpus-review-seed.csv');
const reviewBatchDirectory = path.join(reviewRoot, 'batches');
const reviewLabeledDirectory = path.join(reviewRoot, 'labeled');

const MEDIUM_MINIMUM_TOKEN_LENGTH = 8;
const LONG_MINIMUM_TOKEN_LENGTH = 13;
const SEED_ROWS_PER_GROUP = 100;
const BATCH_SIZE = 10_000;
const MAX_BATCH_COUNT = 10;
const MAX_REVIEW_ROWS = BATCH_SIZE * MAX_BATCH_COUNT;

export function selectNonHeadwordRows(
    cleanedRows,
    headwordIndex,
    {
        maximumRows = MAX_REVIEW_ROWS,
    } = {},
) {
    const nonHeadwordRows = [];
    let scannedRowCount = 0;
    let exactHeadwordMatchCount = 0;

    for (const row of cleanedRows) {
        scannedRowCount += 1;
        if (headwordIndex.headwords.has(row.token.toLowerCase())) {
            exactHeadwordMatchCount += 1;
            continue;
        }

        nonHeadwordRows.push(row);
        if (nonHeadwordRows.length === maximumRows) {
            break;
        }
    }

    return {
        nonHeadwordRows,
        scannedRowCount,
        exactHeadwordMatchCount,
    };
}

export function buildReviewSeedRows(nonHeadwordRows) {
    const topRows = nonHeadwordRows.slice(0, SEED_ROWS_PER_GROUP);
    const mediumRows = nonHeadwordRows
        .filter(({token}) => token.length >= MEDIUM_MINIMUM_TOKEN_LENGTH)
        .slice(0, SEED_ROWS_PER_GROUP);
    const longRows = nonHeadwordRows
        .filter(({token}) => token.length >= LONG_MINIMUM_TOKEN_LENGTH)
        .slice(0, SEED_ROWS_PER_GROUP);

    if (
        topRows.length < SEED_ROWS_PER_GROUP
        || mediumRows.length < SEED_ROWS_PER_GROUP
        || longRows.length < SEED_ROWS_PER_GROUP
    ) {
        throw new Error('Not enough non-headword rows to build the 300-row review seed');
    }

    return [...topRows, ...mediumRows, ...longRows];
}

function asReviewRows(rows) {
    return rows.map(({token, occurrences}) => ({
        token,
        occurrences,
        expected_result: '',
        is_interesting: '',
    }));
}

async function removeExistingReviewBatches(directoryPath) {
    const entries = await readdir(directoryPath, {withFileTypes: true});
    await Promise.all(entries
        .filter((entry) => (
            entry.isFile()
            && /^corpus-review-.*\.csv$/u.test(entry.name)
        ))
        .map((entry) => unlink(path.join(directoryPath, entry.name))));
}

export async function writeReviewOutputs(
    nonHeadwordRows,
    {
        seedPath = reviewSeedPath,
        batchDirectory = reviewBatchDirectory,
        labeledDirectory = reviewLabeledDirectory,
    } = {},
) {
    await mkdir(batchDirectory, {recursive: true});
    await mkdir(labeledDirectory, {recursive: true});
    await removeExistingReviewBatches(batchDirectory);

    await writeReviewBatchCsv(
        seedPath,
        asReviewRows(buildReviewSeedRows(nonHeadwordRows)),
    );

    for (let batchIndex = 0; batchIndex < MAX_BATCH_COUNT; batchIndex += 1) {
        const start = batchIndex * BATCH_SIZE;
        const end = start + BATCH_SIZE;
        const fileName = `corpus-review-${start / 1000}-${end / 1000}k.csv`;
        await writeReviewBatchCsv(
            path.join(batchDirectory, fileName),
            asReviewRows(nonHeadwordRows.slice(start, end)),
        );
    }
}

async function main() {
    const [cleanedRows, headwordIndex] = await Promise.all([
        loadFrequencyCsv(cleanedFrequencyPath),
        loadHeadwordIndex(headwordSourceDirectory),
    ]);
    const {
        nonHeadwordRows,
        scannedRowCount,
        exactHeadwordMatchCount,
    } = selectNonHeadwordRows(cleanedRows, headwordIndex);

    await writeReviewOutputs(nonHeadwordRows);

    console.log(
        `Prepared ${nonHeadwordRows.length.toLocaleString('en-US')} non-headword review token(s) after scanning ${scannedRowCount.toLocaleString('en-US')} cleaned token(s); excluded ${exactHeadwordMatchCount.toLocaleString('en-US')} exact headword match(es) and wrote the review seed plus ${MAX_BATCH_COUNT} batch file(s).`,
    );
}

if (
    process.argv[1] !== undefined
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    await main();
}
