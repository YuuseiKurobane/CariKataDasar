import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const expectedHashes = new Map([
    ['src/yomitan/core/event-dispatcher.js', 'fb486d2026dbf9da7a05073b86892f485de72e60dbe4a5b0912dc48a6bf44afb'],
    ['src/yomitan/core/extension-error.js', '89360fb6b5a9dcc12102ee4b080ee79dc15861fce8eea843c1b16b10b89cf8f5'],
    ['src/yomitan/core/log.js', '81fd33bdf3441c4cfde702a36338ea2c639ee96724b2487d6883b5aa99e4d930'],
    ['src/yomitan/language/language-transformer.js', 'f45db85ae6c5628b65ef0c45d48a47f6091f43109d723f81826dc4a1ce3ae198'],
    ['src/yomitan/language/language-transforms.js', 'e454f0a7333170aa1e96e42e546a316aee9c31b8b1d8056d45c034e1470c8a14'],
    ['src/yomitan/language/text-processors.js', 'a5b244b8995fda8c7603358fc0ea517f57eb0e7966e586a518b5cb3fd3224ab1'],
]);

let failed = false;
for (const [relativePath, expectedHash] of expectedHashes) {
    const contents = await readFile(path.join(repositoryRoot, relativePath));
    const actualHash = createHash('sha256').update(contents).digest('hex');
    if (actualHash !== expectedHash) {
        failed = true;
        console.error(`${relativePath}: expected ${expectedHash}, got ${actualHash}`);
    }
}

if (failed) {
    process.exitCode = 1;
} else {
    console.log(`Verified ${expectedHashes.size} pinned Yomitan runtime files.`);
}

