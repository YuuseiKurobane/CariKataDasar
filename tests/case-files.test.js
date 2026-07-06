import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    loadParserCaseFile,
    loadReviewBatchCsv,
} from '../src/case-files.js';

async function withTemporaryFile(contents, callback, extension = '.txt') {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cari-kata-dasar-'));
    const filePath = path.join(directory, `cases${extension}`);
    try {
        await writeFile(filePath, contents, 'utf8');
        await callback(filePath);
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
}

test('empty parser case text produces zero cases', async () => {
    await withTemporaryFile('\n', async (filePath) => {
        assert.deepEqual(await loadParserCaseFile(filePath), []);
    });
});

test('parser case text preserves the ordered hit sequence', async () => {
    await withTemporaryFile(
        'dirikan, mendirikan, diri\r\n'
            + 'tanpa-hit\n'
            + '\n',
        async (filePath) => {
            assert.deepEqual(await loadParserCaseFile(filePath), [
                {token: 'dirikan', hits: ['mendirikan', 'diri']},
                {token: 'tanpa-hit', hits: []},
            ]);
        },
    );
});

test('parser case text rejects empty entries', async () => {
    await withTemporaryFile('dirikan, , diri\n', async (filePath) => {
        await assert.rejects(
            loadParserCaseFile(filePath),
            /parser case entries must be non-empty/u,
        );
    });
});

test('header-only review batch CSV produces zero cases', async () => {
    await withTemporaryFile(
        'token,occurrences,expected_result,is_interesting\n',
        async (filePath) => {
            assert.deepEqual(await loadReviewBatchCsv(filePath), []);
        },
        '.csv',
    );
});

test('review batch CSV requires exact column order', async () => {
    await withTemporaryFile(
        'token,expected_result,occurrences,is_interesting\n',
        async (filePath) => {
            await assert.rejects(
                loadReviewBatchCsv(filePath),
                /expected token,occurrences,expected_result,is_interesting/u,
            );
        },
        '.csv',
    );
});
