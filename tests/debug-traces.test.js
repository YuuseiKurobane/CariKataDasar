import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {FATAL_NO_HIT_MESSAGE, writeDebugTraces} from '../scripts/write-debug-traces.mjs';

test('debug traces write fatal rows first and combine sorted unique rows', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cari-kata-dasar-'));
    const debugDumpDirectoryPath = path.join(directory, 'debug-dumps');
    const debugResultDirectoryPath = path.join(directory, 'debug-results');
    const combinedOutputFilePath = path.join(debugResultDirectoryPath, '_combined_debug.txt');
    const generator = {
        generate(token) {
            return {
                alpha: [{text: 'alpha'}, {text: 'kata'}],
                beta: [{text: 'beta'}, {text: 'tulis'}],
                gamma: [{text: 'gamma'}, {text: 'kata'}],
                zeta: [{text: 'zeta'}, {text: 'zzz'}],
            }[token] ?? [{text: token}];
        },
    };

    try {
        await mkdir(debugDumpDirectoryPath);
        await writeFile(
            path.join(debugDumpDirectoryPath, 'communitydebug.txt'),
            'beta\n'
                + 'zeta\n'
                + 'alpha\n'
                + 'beta\n',
            'utf8',
        );
        await writeFile(
            path.join(debugDumpDirectoryPath, 'more.txt'),
            'gamma\n'
                + 'alpha\n',
            'utf8',
        );
        await writeFile(
            path.join(debugDumpDirectoryPath, 'ignored_result.txt'),
            'zeta\n',
            'utf8',
        );

        const result = await writeDebugTraces({
            combinedOutputFilePath,
            debugDumpDirectoryPath,
            debugResultDirectoryPath,
            generator,
            headwordIndex: {headwords: new Set(['kata', 'tulis'])},
        });

        assert.deepEqual(result, {
            combinedCount: 4,
            debugFileCount: 2,
            fatalCount: 1,
            tokenCount: 5,
        });
        assert.equal(
            await readFile(path.join(debugResultDirectoryPath, 'communitydebug_result.txt'), 'utf8'),
            `zeta ${FATAL_NO_HIT_MESSAGE}\n`
                + 'beta, tulis\n'
                + 'alpha, kata\n',
        );
        assert.equal(
            await readFile(combinedOutputFilePath, 'utf8'),
            `zeta ${FATAL_NO_HIT_MESSAGE}\n`
                + 'alpha, kata\n'
                + 'beta, tulis\n'
                + 'gamma, kata\n',
        );
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});
