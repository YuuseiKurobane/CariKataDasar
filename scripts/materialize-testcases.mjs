import {mkdir, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
    loadParserCaseFile,
    writeParserCaseFile,
} from '../src/case-files.js';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const testcaseDumpDirectory = path.join(repositoryRoot, 'data', 'testcases-dump');
const outputPath = path.join(repositoryRoot, 'data', 'testcases-results', '_combined_testcases.txt');

function isTestcaseDumpFile(name) {
    return /\.txt$/iu.test(name);
}

async function getTestcaseDumpFiles(directoryPath) {
    try {
        const entries = await readdir(directoryPath, {withFileTypes: true});
        return entries
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .filter(isTestcaseDumpFile)
            .sort();
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

export async function materializeTestcases({
    testcaseDumpDirectoryPath = testcaseDumpDirectory,
    outputFilePath = outputPath,
} = {}) {
    await mkdir(testcaseDumpDirectoryPath, {recursive: true});
    await mkdir(path.dirname(outputFilePath), {recursive: true});

    const fileNames = await getTestcaseDumpFiles(testcaseDumpDirectoryPath);
    const parserCases = [];
    const seenCases = new Set();
    let duplicateCount = 0;

    for (const fileName of fileNames) {
        const rows = await loadParserCaseFile(
            path.join(testcaseDumpDirectoryPath, fileName),
        );
        for (const row of rows) {
            const key = JSON.stringify([
                row.token,
                row.prefixHits,
                row.fuzzyTailHits,
            ]);
            if (seenCases.has(key)) {
                duplicateCount += 1;
                continue;
            }

            seenCases.add(key);
            parserCases.push(row);
        }
    }

    await writeParserCaseFile(outputFilePath, parserCases);
    return {
        caseCount: parserCases.length,
        dumpFileCount: fileNames.length,
        duplicateCount,
    };
}

async function main() {
    const {caseCount, dumpFileCount, duplicateCount} = await materializeTestcases();
    console.log(
        `Wrote ${caseCount} parser testcase(s) from ${dumpFileCount} testcase file(s) to ${path.relative(repositoryRoot, outputPath)}; skipped ${duplicateCount} duplicate(s).`,
    );
}

if (
    process.argv[1] !== undefined
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    await main();
}
