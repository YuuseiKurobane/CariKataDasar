import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {materializeCaseDumps} from '../scripts/materialize-case-dumps.mjs';
import {loadParserCaseFile} from '../src/case-files.js';

test('materializer merges text dumps and deduplicates identical sequences', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cari-kata-dasar-'));
    const caseDumpDirectoryPath = path.join(directory, 'case-dumps');
    const outputFilePath = path.join(directory, 'cases', '_combined.txt');

    try {
        await mkdir(caseDumpDirectoryPath);
        await writeFile(
            path.join(caseDumpDirectoryPath, 'community.txt'),
            'berkata, berkata, kata\n'
                + 'makanan, makanan, makan\n'
                + 'berkata, berkata, kata\n',
            'utf8',
        );
        await writeFile(
            path.join(caseDumpDirectoryPath, 'corpus_review_0-10k.txt'),
            'tulisan, tulisan, tulis\n'
                + 'kiriman, kiriman, kirim\n'
                + 'berkata, berkata, kata\n'
                + 'berkata, berkata, beda\n',
            'utf8',
        );
        await writeFile(
            path.join(caseDumpDirectoryPath, 'README.md'),
            'not a parser case dump',
            'utf8',
        );

        const result = await materializeCaseDumps({
            caseDumpDirectoryPath,
            outputFilePath,
        });

        assert.deepEqual(result, {
            caseCount: 5,
            dumpFileCount: 2,
            duplicateCount: 2,
        });
        assert.deepEqual(await loadParserCaseFile(outputFilePath), [
            {token: 'berkata', hits: ['berkata', 'kata']},
            {token: 'makanan', hits: ['makanan', 'makan']},
            {token: 'tulisan', hits: ['tulisan', 'tulis']},
            {token: 'kiriman', hits: ['kiriman', 'kirim']},
            {token: 'berkata', hits: ['berkata', 'beda']},
        ]);
        assert.equal(
            await readFile(outputFilePath, 'utf8'),
            'berkata, berkata, kata\n'
                + 'makanan, makanan, makan\n'
                + 'tulisan, tulisan, tulis\n'
                + 'kiriman, kiriman, kirim\n'
                + 'berkata, berkata, beda\n',
        );
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});

test('materializer writes an empty text file when no cases exist', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cari-kata-dasar-'));
    const caseDumpDirectoryPath = path.join(directory, 'case-dumps');
    const outputFilePath = path.join(directory, 'cases', '_combined.txt');

    try {
        await mkdir(caseDumpDirectoryPath);
        await writeFile(
            path.join(caseDumpDirectoryPath, 'empty.txt'),
            '\n',
            'utf8',
        );

        await materializeCaseDumps({caseDumpDirectoryPath, outputFilePath});

        assert.equal(await readFile(outputFilePath, 'utf8'), '');
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});
