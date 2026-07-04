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
const INTERESTING_VALUES = new Set(['y', 'yes', 'true', '1']);

function isLabeledBatchFile(name) {
    return /^corpus-review-.*\.csv$/u.test(name);
}

async function getLabeledBatchFiles(directoryPath) {
    try {
        const entries = await readdir(directoryPath, {withFileTypes: true});
        return entries
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .filter(isLabeledBatchFile)
            .sort();
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

export async function materializeCorpusCases({
    labeledDirectoryPath = labeledDirectory,
    outputFilePath = outputPath,
} = {}) {
    await mkdir(labeledDirectoryPath, {recursive: true});

    const fileNames = await getLabeledBatchFiles(labeledDirectoryPath);
    const curatedCases = [];

    for (const fileName of fileNames) {
        const rows = await loadReviewBatchCsv(path.join(labeledDirectoryPath, fileName));
        for (const row of rows) {
            const token = row.token.trim();
            const expectedResult = row.expected_result.trim();
            const isInteresting = row.is_interesting.trim().toLowerCase();

            if (
                token.length === 0
                || expectedResult.length === 0
                || !INTERESTING_VALUES.has(isInteresting)
            ) {
                continue;
            }

            curatedCases.push({
                token,
                expected_result: expectedResult,
            });
        }
    }

    await writeRegressionCaseCsv(outputFilePath, curatedCases);
    return {
        curatedCaseCount: curatedCases.length,
        labeledFileCount: fileNames.length,
    };
}

async function main() {
    const {curatedCaseCount, labeledFileCount} = await materializeCorpusCases();
    console.log(
        `Wrote ${curatedCaseCount} curated corpus case(s) from ${labeledFileCount} labeled review batch file(s) to ${path.relative(repositoryRoot, outputPath)}`,
    );
}

if (
    process.argv[1] !== undefined
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    await main();
}
