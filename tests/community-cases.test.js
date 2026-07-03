import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {indonesianCandidateGenerator} from '../src/candidate-generator.js';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const contents = await readFile(
    path.join(repositoryRoot, 'data', 'cases', 'community.jsonl'),
    'utf8',
);
const cases = contents
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));

for (const {token, expected_any: expectedAny} of cases) {
    test(`community case ${token} generates an expected headword`, () => {
        const candidates = new Set(
            indonesianCandidateGenerator.generate(token).map(({text}) => text),
        );
        assert.ok(
            expectedAny.some((headword) => candidates.has(headword)),
            `${token} did not generate any of: ${expectedAny.join(', ')}`,
        );
    });
}

