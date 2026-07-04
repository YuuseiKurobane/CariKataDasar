import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {materializeCorpusCases} from '../scripts/materialize-corpus-cases.mjs';
import {loadRegressionCaseCsv} from '../src/case-files.js';

const REVIEW_HEADER = 'token,occurrences,expected_result,is_interesting\n';

test('materializer accepts supported truthy values and filters incomplete rows', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cari-kata-dasar-'));
    const labeledDirectoryPath = path.join(directory, 'labeled');
    const outputFilePath = path.join(directory, 'corpus-curated.csv');

    try {
        await mkdir(labeledDirectoryPath);
        await writeFile(
            path.join(labeledDirectoryPath, 'corpus-review-custom.csv'),
            REVIEW_HEADER
                + 'berkata,10,kata,y\n'
                + 'makanan,9,makan, YES \n'
                + 'tulisan,8,tulis,True\n'
                + 'kiriman,7,kirim,1\n'
                + 'abaikan,6,abai,no\n'
                + 'kosong,5,,y\n',
            'utf8',
        );
        await writeFile(
            path.join(labeledDirectoryPath, 'corpus-review-empty.csv'),
            REVIEW_HEADER,
            'utf8',
        );
        await writeFile(
            path.join(labeledDirectoryPath, 'unrelated.csv'),
            REVIEW_HEADER + 'salah,1,salah,y\n',
            'utf8',
        );

        const result = await materializeCorpusCases({
            labeledDirectoryPath,
            outputFilePath,
        });

        assert.deepEqual(result, {
            curatedCaseCount: 4,
            labeledFileCount: 2,
        });
        assert.deepEqual(await loadRegressionCaseCsv(outputFilePath), [
            {token: 'berkata', expected_result: 'kata'},
            {token: 'makanan', expected_result: 'makan'},
            {token: 'tulisan', expected_result: 'tulis'},
            {token: 'kiriman', expected_result: 'kirim'},
        ]);
        assert.match(await readFile(outputFilePath, 'utf8'), /^token,expected_result\n/u);
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});

test('materializer writes a header-only CSV when no cases qualify', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cari-kata-dasar-'));
    const labeledDirectoryPath = path.join(directory, 'labeled');
    const outputFilePath = path.join(directory, 'corpus-curated.csv');

    try {
        await mkdir(labeledDirectoryPath);
        await writeFile(
            path.join(labeledDirectoryPath, 'corpus-review-empty.csv'),
            REVIEW_HEADER,
            'utf8',
        );

        await materializeCorpusCases({labeledDirectoryPath, outputFilePath});

        assert.equal(await readFile(outputFilePath, 'utf8'), 'token,expected_result\n');
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});
