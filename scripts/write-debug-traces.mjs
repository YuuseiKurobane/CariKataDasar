import {mkdir, readdir, readFile, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {indonesianCandidateGenerator} from '../src/candidate-generator.js';
import {loadHeadwordIndex} from '../src/headword-index.js';

export const FATAL_NO_HIT_MESSAGE = 'FATAL ERROR GAK DAPET HIT CUY';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const debugDumpDirectory = path.join(repositoryRoot, 'data', 'debug-dumps');
const debugResultDirectory = path.join(repositoryRoot, 'data', 'debug-results');
const combinedOutputPath = path.join(debugResultDirectory, '_combined_debug.txt');
const headwordSourceDirectory = path.join(
    repositoryRoot,
    'data',
    'headwords',
    'sources',
);

function isDebugDumpFile(name) {
    return /\.txt$/iu.test(name) && !/_result\.txt$/iu.test(name);
}

async function getDebugDumpFiles(directoryPath) {
    try {
        const entries = await readdir(directoryPath, {withFileTypes: true});
        return entries
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .filter(isDebugDumpFile)
            .sort();
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

function getUniqueInputTokens(contents) {
    const seenTokens = new Set();
    const tokens = [];

    for (const line of contents.split(/\r\n?|\n/u)) {
        const token = line.trim();
        if (token.length === 0 || seenTokens.has(token)) {
            continue;
        }
        seenTokens.add(token);
        tokens.push(token);
    }

    return tokens;
}

function createDebugTraceRow(token, headwords, generator) {
    const hits = generator.generate(token)
        .filter(({text}) => headwords.has(text))
        .map(({text}) => text);

    if (hits.length === 0) {
        return {
            hitCount: 0,
            isFatal: true,
            line: `${token} ${FATAL_NO_HIT_MESSAGE}`,
            token,
        };
    }

    return {
        hitCount: hits.length,
        isFatal: false,
        line: [token, ...hits].join(', '),
        token,
    };
}

function orderRowsForSourceFile(rows) {
    return [
        ...rows.filter(({isFatal}) => isFatal),
        ...rows.filter(({isFatal}) => !isFatal),
    ];
}

function orderRowsForCombinedFile(rows) {
    const compareToken = (left, right) => left.token.localeCompare(right.token);
    return [
        ...rows.filter(({isFatal}) => isFatal).sort(compareToken),
        ...rows.filter(({isFatal}) => !isFatal).sort(compareToken),
    ];
}

async function writeTextAtomic(filePath, contents) {
    const temporaryPath = `${filePath}.tmp-${process.pid}`;
    await writeFile(temporaryPath, contents, 'utf8');
    await rename(temporaryPath, filePath);
}

function serializeRows(rows) {
    return rows.length === 0 ? '' : `${rows.map(({line}) => line).join('\n')}\n`;
}

function resultFileNameFor(debugDumpFileName) {
    return debugDumpFileName.replace(/\.txt$/iu, '_result.txt');
}

export async function writeDebugTraces({
    debugDumpDirectoryPath = debugDumpDirectory,
    debugResultDirectoryPath = debugResultDirectory,
    combinedOutputFilePath = combinedOutputPath,
    headwordIndex,
    generator = indonesianCandidateGenerator,
} = {}) {
    await mkdir(debugDumpDirectoryPath, {recursive: true});
    await mkdir(debugResultDirectoryPath, {recursive: true});

    const index = headwordIndex ?? await loadHeadwordIndex(headwordSourceDirectory);
    const fileNames = await getDebugDumpFiles(debugDumpDirectoryPath);
    const combinedRowsByToken = new Map();
    let tokenCount = 0;
    let fatalCount = 0;

    for (const fileName of fileNames) {
        const contents = await readFile(path.join(debugDumpDirectoryPath, fileName), 'utf8');
        const rows = getUniqueInputTokens(contents)
            .map((token) => createDebugTraceRow(token, index.headwords, generator));

        tokenCount += rows.length;
        fatalCount += rows.filter(({isFatal}) => isFatal).length;

        for (const row of rows) {
            if (!combinedRowsByToken.has(row.token)) {
                combinedRowsByToken.set(row.token, row);
            }
        }

        await writeTextAtomic(
            path.join(debugResultDirectoryPath, resultFileNameFor(fileName)),
            serializeRows(orderRowsForSourceFile(rows)),
        );
    }

    const combinedRows = orderRowsForCombinedFile([...combinedRowsByToken.values()]);
    await writeTextAtomic(combinedOutputFilePath, serializeRows(combinedRows));

    return {
        combinedCount: combinedRows.length,
        debugFileCount: fileNames.length,
        fatalCount,
        tokenCount,
    };
}

async function main() {
    const {combinedCount, debugFileCount, fatalCount, tokenCount} = await writeDebugTraces();
    console.log(
        `Wrote ${tokenCount} debug trace row(s) from ${debugFileCount} debug dump file(s) to ${path.relative(repositoryRoot, debugResultDirectory)}; ${fatalCount} row(s) had no headword hit; combined ${combinedCount} unique token(s).`,
    );
}

if (
    process.argv[1] !== undefined
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    await main();
}
