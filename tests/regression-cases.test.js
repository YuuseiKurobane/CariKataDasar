import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {indonesianCandidateGenerator} from '../src/candidate-generator.js';
import {loadParserCaseFile} from '../src/case-files.js';
import {loadHeadwordIndex} from '../src/headword-index.js';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const combinedCaseFilePath = path.join(
    repositoryRoot,
    'data',
    'cases',
    '_combined.txt',
);
const headwordSourceDirectory = path.join(
    repositoryRoot,
    'data',
    'headwords',
    'sources',
);
const [parserCases, headwordIndex] = await Promise.all([
    loadParserCaseFile(combinedCaseFilePath),
    loadHeadwordIndex(headwordSourceDirectory),
]);

for (const {token, hits: expectedHits} of parserCases) {
    test(`regression case ${token} follows its ordered hit sequence`, () => {
        if (
            expectedHits.length === 1
            && expectedHits[0] === token
            && headwordIndex.headwords.has(token)
        ) {
            console.warn(
                `Warning: regression case ${token} is probably redundant because its only hit is the token, which is already a headword.`,
            );
        }

        const candidates = indonesianCandidateGenerator.generate(token);
        assert.equal(
            candidates[0]?.text,
            token,
            `${token} was not the first generated candidate`,
        );

        const actualHits = candidates
            .filter(({text}) => headwordIndex.headwords.has(text))
            .map(({text}) => text);
        assert.deepEqual(
            actualHits,
            expectedHits,
            `${token} resolved a different ordered hit sequence`,
        );
    });
}
