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

test('parser case text preserves the strict prefix and fuzzy tail', async () => {
    await withTemporaryFile(
        'dirikan, mendirikan, diri\r\n'
            + 'diberikan, diberikan, memberikan, (berikan, diberi, beri)\n'
            + '\n',
        async (filePath) => {
            assert.deepEqual(await loadParserCaseFile(filePath), [
                {
                    token: 'dirikan',
                    prefixHits: ['mendirikan', 'diri'],
                    fuzzyTailHits: [],
                },
                {
                    token: 'diberikan',
                    prefixHits: ['diberikan', 'memberikan'],
                    fuzzyTailHits: ['berikan', 'diberi', 'beri'],
                },
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

test('parser case text rejects fuzzy brackets before the tail', async () => {
    await withTemporaryFile('dirikan, (dir), rik\n', async (filePath) => {
        await assert.rejects(
            loadParserCaseFile(filePath),
            /Syntax Error: fuzzy tail brackets are only allowed at the end/u,
        );
    });
});

test('parser case text rejects malformed fuzzy tails', async () => {
    await withTemporaryFile('dirikan, dirikan, ()\n', async (filePath) => {
        await assert.rejects(
            loadParserCaseFile(filePath),
            /Syntax Error: fuzzy tail must contain at least one entry/u,
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
