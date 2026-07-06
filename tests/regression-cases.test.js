import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {indonesianCandidateGenerator} from '../src/candidate-generator.js';
import {loadRegressionCaseCsv} from '../src/case-files.js';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const regressionFilePath = path.join(
    repositoryRoot,
    'data',
    'cases',
    'regression.csv',
);
const regressionCases = await loadRegressionCaseCsv(regressionFilePath);

for (const {token, expected_result: expectedResult} of regressionCases) {
    test(`regression case ${token} generates ${expectedResult}`, () => {
        const candidates = new Set(
            indonesianCandidateGenerator.generate(token).map(({text}) => text),
        );
        assert.ok(
            candidates.has(expectedResult),
            `${token} did not generate expected headword ${expectedResult}`,
        );
    });
}
