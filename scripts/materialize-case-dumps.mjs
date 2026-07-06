import {mkdir, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
    loadCaseDumpCsv,
    writeRegressionCaseCsv,
} from '../src/case-files.js';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const caseDumpDirectory = path.join(repositoryRoot, 'data', 'case-dumps');
const outputPath = path.join(repositoryRoot, 'data', 'cases', 'regression.csv');

function isCaseDumpFile(name) {
    return /\.csv$/iu.test(name);
}

async function getCaseDumpFiles(directoryPath) {
    try {
        const entries = await readdir(directoryPath, {withFileTypes: true});
        return entries
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .filter(isCaseDumpFile)
            .sort();
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

export async function materializeCaseDumps({
    caseDumpDirectoryPath = caseDumpDirectory,
    outputFilePath = outputPath,
} = {}) {
    await mkdir(caseDumpDirectoryPath, {recursive: true});
    await mkdir(path.dirname(outputFilePath), {recursive: true});

    const fileNames = await getCaseDumpFiles(caseDumpDirectoryPath);
    const regressionCases = [];
    const seenCases = new Set();
    let duplicateCount = 0;

    for (const fileName of fileNames) {
        const rows = await loadCaseDumpCsv(
            path.join(caseDumpDirectoryPath, fileName),
        );
        for (const row of rows) {
            const key = JSON.stringify([row.token, row.expected_result]);
            if (seenCases.has(key)) {
                duplicateCount += 1;
                continue;
            }

            seenCases.add(key);
            regressionCases.push(row);
        }
    }

    await writeRegressionCaseCsv(outputFilePath, regressionCases);
    return {
        caseCount: regressionCases.length,
        dumpFileCount: fileNames.length,
        duplicateCount,
    };
}

async function main() {
    const {caseCount, dumpFileCount, duplicateCount} = await materializeCaseDumps();
    console.log(
        `Wrote ${caseCount} regression case(s) from ${dumpFileCount} case dump file(s) to ${path.relative(repositoryRoot, outputPath)}; skipped ${duplicateCount} duplicate(s).`,
    );
}

if (
    process.argv[1] !== undefined
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    await main();
}
