import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {loadHeadwordIndex} from '../src/headword-index.js';

test('headword index preserves exact spelling and provenance', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cari-kata-dasar-'));
    try {
        await writeFile(path.join(directory, 'a.txt'), 'kata\nKata\nsama\n', 'utf8');
        await writeFile(path.join(directory, 'b.txt'), 'sama\nbeda\n', 'utf8');

        const index = await loadHeadwordIndex(directory);

        assert.equal(index.headwords.size, 4);
        assert.ok(index.headwords.has('kata'));
        assert.ok(index.headwords.has('Kata'));
        assert.deepEqual(index.sourcesByHeadword.get('sama'), ['a.txt', 'b.txt']);
        assert.deepEqual(index.sourceFiles, ['a.txt', 'b.txt']);
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});

