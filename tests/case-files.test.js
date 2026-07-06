import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    loadCaseDumpCsv,
    loadRegressionCaseCsv,
    loadReviewBatchCsv,
} from '../src/case-files.js';

async function withTemporaryCsv(contents, callback) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cari-kata-dasar-'));
    const filePath = path.join(directory, 'cases.csv');
    try {
        await writeFile(filePath, contents, 'utf8');
        await callback(filePath);
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
}

test('header-only regression case CSV produces zero cases', async () => {
    await withTemporaryCsv('token,expected_result\n', async (filePath) => {
        assert.deepEqual(await loadRegressionCaseCsv(filePath), []);
    });
});

test('header-only review batch CSV produces zero cases', async () => {
    await withTemporaryCsv(
        'token,occurrences,expected_result,is_interesting\n',
        async (filePath) => {
            assert.deepEqual(await loadReviewBatchCsv(filePath), []);
        },
    );
});

test('regression case CSV requires exact column order', async () => {
    await withTemporaryCsv('expected_result,token\n', async (filePath) => {
        await assert.rejects(
            loadRegressionCaseCsv(filePath),
            /expected token,expected_result/u,
        );
    });
});

test('case dump CSV requires token and expected_result in any column order', async () => {
    await withTemporaryCsv(
        'notes,expected_result,token,enabled,unknown\n'
            + 'keep,makan,makanan,,ignored\n'
            + 'keep,tulis,tulisan,yes,ignored\n',
        async (filePath) => {
            assert.deepEqual(await loadCaseDumpCsv(filePath), [
                {token: 'makanan', expected_result: 'makan'},
                {token: 'tulisan', expected_result: 'tulis'},
            ]);
        },
    );
});

test('case dump CSV ignores empty, incomplete, and disabled rows', async () => {
    await withTemporaryCsv(
        'token,expected_result,enabled,notes\n'
            + '\n'
            + ',,,\n'
            + 'berkata,,true,\n'
            + ',kata,true,\n'
            + 'abaikan,abai,false,\n'
            + 'abaikan-juga,abai, OFF ,\n'
            + 'kiriman,kirim\n',
        async (filePath) => {
            assert.deepEqual(await loadCaseDumpCsv(filePath), [
                {token: 'kiriman', expected_result: 'kirim'},
            ]);
        },
    );
});

test('case dump CSV rejects a missing required column', async () => {
    await withTemporaryCsv('token,notes\nkata,missing expected result\n', async (filePath) => {
        await assert.rejects(
            loadCaseDumpCsv(filePath),
            /exactly one expected_result column/u,
        );
    });
});

test('review batch CSV requires exact column order', async () => {
    await withTemporaryCsv(
        'token,expected_result,occurrences,is_interesting\n',
        async (filePath) => {
            await assert.rejects(
                loadReviewBatchCsv(filePath),
                /expected token,occurrences,expected_result,is_interesting/u,
            );
        },
    );
});
