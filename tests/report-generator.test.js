import assert from 'node:assert/strict';
import test from 'node:test';
import {createWideReportRecord, resolveToken} from '../src/report-generator.js';

test('resolution uses the first matching unique candidate', () => {
    const index = {
        headwords: new Set(['selesaikan', 'selesai']),
        sourcesByHeadword: new Map([
            ['selesaikan', ['dictionary-a.txt']],
            ['selesai', ['dictionary-b.txt']],
        ]),
    };

    const result = resolveToken('diselesaikan', 123, index);
    const record = createWideReportRecord(result);

    assert.equal(result.resolution, 'selesaikan');
    assert.equal(result.resolutionRank, 3);
    assert.deepEqual(result.resolutionSources, ['dictionary-a.txt']);
    assert.equal(record.token, 'diselesaikan');
    assert.equal(record.occurrences, 123);
    assert.equal(record.word1, 'diselesaikan');
    assert.equal(record.word3, 'selesaikan');
});

test('unresolved tokens use blank wide-report fields', () => {
    const index = {
        headwords: new Set(),
        sourcesByHeadword: new Map(),
    };

    const record = createWideReportRecord(resolveToken('xyz', 4, index));
    assert.equal(record.resolution, '');
    assert.equal(record.resolution_rank, '');
});

