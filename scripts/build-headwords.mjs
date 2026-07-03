import {mkdir, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadHeadwordIndex} from '../src/headword-index.js';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDirectory = path.join(repositoryRoot, 'data', 'headwords', 'sources');
const outputDirectory = path.join(repositoryRoot, 'data', 'generated');

await mkdir(outputDirectory, {recursive: true});
const index = await loadHeadwordIndex(sourceDirectory);
const headwords = [...index.headwords].sort();

await writeAtomic(
    path.join(outputDirectory, 'headwords_combined.txt'),
    `${headwords.join('\n')}\n`,
);
await writeAtomic(
    path.join(outputDirectory, 'headword_provenance.jsonl'),
    `${headwords.map((headword) => JSON.stringify({
        headword,
        sources: index.sourcesByHeadword.get(headword),
    })).join('\n')}\n`,
);

console.log(
    `Wrote ${headwords.length.toLocaleString('en-US')} exact headwords ` +
    `from ${index.sourceFiles.length} sources.`,
);

async function writeAtomic(destination, contents) {
    const temporary = `${destination}.tmp-${process.pid}`;
    await writeFile(temporary, contents, 'utf8');
    await rename(temporary, destination);
}

