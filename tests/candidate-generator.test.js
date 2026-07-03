import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getIndonesianTextVariants,
    indonesianCandidateGenerator,
} from '../src/candidate-generator.js';

test('formal active form is tried before the root', () => {
    const words = indonesianCandidateGenerator
        .generate('diselesaikan')
        .map(({text}) => text);

    assert.ok(words.indexOf('menyelesaikan') < words.indexOf('selesai'));
});

test('numeric reduplication is expanded before it is reduced', () => {
    const words = indonesianCandidateGenerator
        .generate('gara2')
        .map(({text}) => text);

    assert.ok(words.indexOf('gara-gara') < words.indexOf('gara'));
});

test('capitalized corpus tokens receive a lowercase variant', () => {
    const variants = getIndonesianTextVariants('Diselesaikan').map(({text}) => text);
    assert.deepEqual(variants, ['Diselesaikan', 'diselesaikan']);

    const words = indonesianCandidateGenerator
        .generate('Diselesaikan')
        .map(({text}) => text);
    assert.equal(words[0], 'Diselesaikan');
    assert.ok(words.includes('menyelesaikan'));
});

test('candidate text is deduplicated at first occurrence', () => {
    const candidates = indonesianCandidateGenerator.generate('memberitahukannya');
    const words = candidates.map(({text}) => text);

    assert.equal(new Set(words).size, words.length);
    assert.deepEqual(
        candidates.map(({rank}) => rank),
        Array.from({length: candidates.length}, (_, index) => index + 1),
    );
});

