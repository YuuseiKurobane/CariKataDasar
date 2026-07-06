import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {materializeCaseDumps} from '../scripts/materialize-case-dumps.mjs';
import {loadRegressionCaseCsv} from '../src/case-files.js';

test('materializer merges arbitrary CSV dumps and deduplicates case pairs', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cari-kata-dasar-'));
    const caseDumpDirectoryPath = path.join(directory, 'case-dumps');
    const outputFilePath = path.join(directory, 'cases', '_combined.csv');

    try {
        await mkdir(caseDumpDirectoryPath);
        await writeFile(
            path.join(caseDumpDirectoryPath, 'community1.csv'),
            'token,expected_result,notes\n'
                + 'berkata,kata,community report\n'
                + 'makanan,makan,\n'
                + 'berkata,kata,duplicate\n',
            'utf8',
        );
        await writeFile(
            path.join(caseDumpDirectoryPath, 'try1_0-10k.csv'),
            'expected_result,enabled,token,anything\n'
                + 'tulis,true,tulisan,ignored\n'
                + 'kirim,,kiriman,\n'
                + 'kata,yes,berkata,\n'
                + 'beda,true,berkata,\n',
            'utf8',
        );
        await writeFile(
            path.join(caseDumpDirectoryPath, 'README.md'),
            'not a CSV dump',
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
        assert.deepEqual(await loadRegressionCaseCsv(outputFilePath), [
            {token: 'berkata', expected_result: 'kata'},
            {token: 'makanan', expected_result: 'makan'},
            {token: 'tulisan', expected_result: 'tulis'},
            {token: 'kiriman', expected_result: 'kirim'},
            {token: 'berkata', expected_result: 'beda'},
        ]);
        assert.match(await readFile(outputFilePath, 'utf8'), /^token,expected_result\n/u);
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});

test('materializer writes a header-only CSV when no cases qualify', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cari-kata-dasar-'));
    const caseDumpDirectoryPath = path.join(directory, 'case-dumps');
    const outputFilePath = path.join(directory, 'cases', '_combined.csv');

    try {
        await mkdir(caseDumpDirectoryPath);
        await writeFile(
            path.join(caseDumpDirectoryPath, 'empty.csv'),
            'token,expected_result\n',
            'utf8',
        );

        await materializeCaseDumps({caseDumpDirectoryPath, outputFilePath});

        assert.equal(await readFile(outputFilePath, 'utf8'), 'token,expected_result\n');
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});
