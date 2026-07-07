import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {materializeTestcases} from '../scripts/materialize-testcases.mjs';
import {loadParserCaseFile} from '../src/case-files.js';

test('materializer merges testcase dumps and deduplicates identical sequences', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cari-kata-dasar-'));
    const testcaseDumpDirectoryPath = path.join(directory, 'testcases-dump');
    const outputFilePath = path.join(directory, 'testcases-results', '_combined_testcases.txt');

    try {
        await mkdir(testcaseDumpDirectoryPath);
        await writeFile(
            path.join(testcaseDumpDirectoryPath, 'community.txt'),
            'berkata, berkata, kata\n'
                + 'diberikan, diberikan, memberikan, (berikan, diberi, beri)\n'
                + 'makanan, makanan, makan\n'
                + 'berkata, berkata, kata\n',
            'utf8',
        );
        await writeFile(
            path.join(testcaseDumpDirectoryPath, 'corpus_review_0-10k.txt'),
            'tulisan, tulisan, tulis\n'
                + 'kiriman, kiriman, kirim\n'
                + 'berkata, berkata, kata\n'
                + 'diberikan, diberikan, memberikan, (berikan, diberi, beri)\n'
                + 'berkata, berkata, beda\n',
            'utf8',
        );
        await writeFile(
            path.join(testcaseDumpDirectoryPath, 'README.md'),
            'not a parser testcase dump',
            'utf8',
        );

        const result = await materializeTestcases({
            testcaseDumpDirectoryPath,
            outputFilePath,
        });

        assert.deepEqual(result, {
            caseCount: 6,
            dumpFileCount: 2,
            duplicateCount: 3,
        });
        assert.deepEqual(await loadParserCaseFile(outputFilePath), [
            {
                token: 'berkata',
                prefixHits: ['berkata', 'kata'],
                fuzzyTailHits: [],
            },
            {
                token: 'diberikan',
                prefixHits: ['diberikan', 'memberikan'],
                fuzzyTailHits: ['berikan', 'diberi', 'beri'],
            },
            {
                token: 'makanan',
                prefixHits: ['makanan', 'makan'],
                fuzzyTailHits: [],
            },
            {
                token: 'tulisan',
                prefixHits: ['tulisan', 'tulis'],
                fuzzyTailHits: [],
            },
            {
                token: 'kiriman',
                prefixHits: ['kiriman', 'kirim'],
                fuzzyTailHits: [],
            },
            {
                token: 'berkata',
                prefixHits: ['berkata', 'beda'],
                fuzzyTailHits: [],
            },
        ]);
        assert.equal(
            await readFile(outputFilePath, 'utf8'),
            'berkata, berkata, kata\n'
                + 'diberikan, diberikan, memberikan, (berikan, diberi, beri)\n'
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
    const testcaseDumpDirectoryPath = path.join(directory, 'testcases-dump');
    const outputFilePath = path.join(directory, 'testcases-results', '_combined_testcases.txt');

    try {
        await mkdir(testcaseDumpDirectoryPath);
        await writeFile(
            path.join(testcaseDumpDirectoryPath, 'empty.txt'),
            '\n',
            'utf8',
        );

        await materializeTestcases({testcaseDumpDirectoryPath, outputFilePath});

        assert.equal(await readFile(outputFilePath, 'utf8'), '');
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});
