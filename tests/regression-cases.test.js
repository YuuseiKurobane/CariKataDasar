import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {indonesianCandidateGenerator} from '../src/candidate-generator.js';
import {loadRegressionCaseCsv} from '../src/case-files.js';
import {loadHeadwordIndex} from '../src/headword-index.js';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const regressionFilePath = path.join(
    repositoryRoot,
    'data',
    'cases',
    '_combined.csv',
);
const headwordSourceDirectory = path.join(
    repositoryRoot,
    'data',
    'headwords',
    'sources',
);
const [regressionCases, headwordIndex] = await Promise.all([
    loadRegressionCaseCsv(regressionFilePath),
    loadHeadwordIndex(headwordSourceDirectory),
]);

for (const {token, expected_result: expectedResult} of regressionCases) {
    test(`regression case ${token} first resolves to ${expectedResult}`, () => {
        if (token === expectedResult && headwordIndex.headwords.has(token)) {
            console.warn(
                `Warning: regression case ${token} -> ${expectedResult} is probably redundant because the token is already a headword.`,
            );
        }

        const candidates = indonesianCandidateGenerator.generate(token);
        const firstResolvingCandidate = candidates.find(
            ({text}) => headwordIndex.headwords.has(text),
        );
        assert.equal(
            firstResolvingCandidate?.text,
            expectedResult,
            `${token} first resolved to ${firstResolvingCandidate?.text ?? 'no headword'}; expected ${expectedResult}`,
        );
    });
}
