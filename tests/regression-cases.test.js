import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {indonesianCandidateGenerator} from '../src/candidate-generator.js';
import {loadRegressionCaseCsv} from '../src/case-files.js';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const caseSuiteFiles = [
    {
        label: 'community',
        filePath: path.join(repositoryRoot, 'data', 'cases', 'community.csv'),
    },
];
const corpusCaseFile = {
    label: 'corpus',
    filePath: path.join(repositoryRoot, 'data', 'cases', 'corpus-curated.csv'),
};

try {
    await access(corpusCaseFile.filePath);
    caseSuiteFiles.push(corpusCaseFile);
} catch (error) {
    if (error?.code !== 'ENOENT') {
        throw error;
    }
}

const caseSuites = await Promise.all(caseSuiteFiles.map(async ({label, filePath}) => ({
    label,
    cases: await loadRegressionCaseCsv(filePath),
})));

for (const {label, cases} of caseSuites) {
    for (const {token, expected_result: expectedResult} of cases) {
        test(`${label} regression case ${token} generates ${expectedResult}`, () => {
            const candidates = new Set(
                indonesianCandidateGenerator.generate(token).map(({text}) => text),
            );
            assert.ok(
                candidates.has(expectedResult),
                `${token} did not generate expected headword ${expectedResult}`,
            );
        });
    }
}
