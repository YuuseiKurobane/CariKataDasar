import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
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
