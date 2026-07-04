import {mkdir, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
    loadReviewBatchCsv,
    writeRegressionCaseCsv,
} from '../src/case-files.js';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const labeledDirectory = path.join(repositoryRoot, 'data', 'review', 'labeled');
const outputPath = path.join(repositoryRoot, 'data', 'cases', 'corpus-curated.csv');

function getBatchStart(name) {
    const match = /^corpus-review-(\d+)-(\d+)k\.csv$/u.exec(name);
    return match === null ? null : Number.parseInt(match[1], 10);
}

async function getLabeledBatchFiles(directoryPath) {
    try {
        const entries = await readdir(directoryPath, {withFileTypes: true});
        return entries
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .filter((name) => getBatchStart(name) !== null)
            .sort((left, right) => getBatchStart(left) - getBatchStart(right));
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

async function main() {
    await mkdir(labeledDirectory, {recursive: true});

    const fileNames = await getLabeledBatchFiles(labeledDirectory);
    const curatedCases = [];

    for (const fileName of fileNames) {
        const rows = await loadReviewBatchCsv(path.join(labeledDirectory, fileName));
        for (const row of rows) {
            const token = row.token.trim();
            const expectedResult = row.expected_result.trim();
            const isInteresting = row.is_interesting.trim().toLowerCase();

            if (token.length === 0 || expectedResult.length === 0 || isInteresting !== 'y') {
                continue;
            }

            curatedCases.push({
                token,
                expected_result: expectedResult,
            });
        }
    }

    await writeRegressionCaseCsv(outputPath, curatedCases);
    console.log(
        `Wrote ${curatedCases.length} curated corpus case(s) from ${fileNames.length} labeled review batch file(s) to ${path.relative(repositoryRoot, outputPath)}`,
    );
}

await main();
