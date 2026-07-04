import assert from 'node:assert/strict';
import test from 'node:test';
import {selectNonHeadwordRows} from '../scripts/prepare-review-cases.mjs';

test('review preparation excludes only lowercased exact headword matches', () => {
    const cleanedRows = [
        {token: 'YANG', occurrences: '1000'},
        {token: 'berkata', occurrences: '900'},
        {token: 'tidakdikenal', occurrences: '800'},
    ];
    const headwordIndex = {
        headwords: new Set(['yang', 'kata']),
        sourcesByHeadword: new Map([
            ['yang', ['dictionary.txt']],
            ['kata', ['dictionary.txt']],
        ]),
    };

    const result = selectNonHeadwordRows(cleanedRows, headwordIndex);

    assert.deepEqual(result.nonHeadwordRows, [
        {token: 'berkata', occurrences: '900'},
        {token: 'tidakdikenal', occurrences: '800'},
    ]);
    assert.equal(result.scannedRowCount, 3);
    assert.equal(result.exactHeadwordMatchCount, 1);
});
