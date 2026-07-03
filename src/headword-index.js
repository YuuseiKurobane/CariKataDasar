import {createReadStream} from 'node:fs';
import {readdir} from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

/**
 * Load exact headwords and retain every source containing each headword.
 *
 * @param {string} sourceDirectory
 * @returns {Promise<{
 *   headwords: Set<string>,
 *   sourcesByHeadword: Map<string, string[]>,
 *   sourceFiles: string[],
 * }>}
 */
export async function loadHeadwordIndex(sourceDirectory) {
    const entries = await readdir(sourceDirectory, {withFileTypes: true});
    const sourceFiles = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.txt'))
        .map(({name}) => name)
        .sort();

    if (sourceFiles.length === 0) {
        throw new Error(`No .txt headword sources found in ${sourceDirectory}`);
    }

    const sourcesByHeadword = new Map();
    for (const sourceFile of sourceFiles) {
        const stream = createReadStream(path.join(sourceDirectory, sourceFile), {
            encoding: 'utf8',
        });
        const lines = readline.createInterface({input: stream, crlfDelay: Infinity});
        for await (const headword of lines) {
            if (headword.length === 0) {
                continue;
            }
            const sources = sourcesByHeadword.get(headword);
            if (typeof sources === 'undefined') {
                sourcesByHeadword.set(headword, [sourceFile]);
            } else if (sources.at(-1) !== sourceFile) {
                sources.push(sourceFile);
            }
        }
    }

    return {
        headwords: new Set(sourcesByHeadword.keys()),
        sourcesByHeadword,
        sourceFiles,
    };
}
