/*
 * Copyright (C) 2024-2026  Yomitan Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import {prefixInflection, suffixInflection, wholeWordInflection} from '../language-transforms.js';

const conditions = {
    v: {
        name: 'Verb',
        isDictionaryForm: true,
    },
};

/** @typedef {keyof typeof conditions} Condition */

/**
 * @param {import('language-transformer').Rule<Condition>['type']} type
 * @param {RegExp} isInflected
 * @param {import('language-transformer').DeinflectFunction} deinflect
 * @param {Condition[]} [conditionsOut]
 * @returns {import('language-transformer').Rule<Condition>}
 */
function createInflection(type, isInflected, deinflect, conditionsOut = []) {
    return {
        type,
        isInflected,
        deinflect,
        conditionsIn: [],
        conditionsOut,
    };
}

/**
 * @param {RegExp} regex
 * @param {string} text
 * @returns {RegExpExecArray}
 * @throws {Error}
 */
function getMatch(regex, text) {
    const match = regex.exec(text);
    if (match === null) {
        throw new Error(`Inflection pattern ${regex.source} did not match ${text}`);
    }
    return match;
}

/**
 * @param {RegExp} isInflected
 * @param {string} restoredInitial
 * @param {string} formalSuffix
 * @returns {import('language-transformer').Rule<Condition>}
 */
function createActiveInflection(isInflected, restoredInitial = '', formalSuffix = '') {
    return createInflection('other', isInflected, (text) => {
        const match = getMatch(isInflected, text);
        return createActiveForm(restoredInitial + match[1]) + formalSuffix;
    }, ['v']);
}

/**
 * @param {RegExp} isInflected
 * @param {string} restoredInitial
 * @returns {import('language-transformer').Rule<Condition>}
 */
function createRestoredPrefixInflection(isInflected, restoredInitial) {
    return createInflection('prefix', isInflected, (text) => {
        const match = getMatch(isInflected, text);
        return restoredInitial + match[1];
    });
}

/**
 * @param {RegExp} isInflected
 * @returns {import('language-transformer').Rule<Condition>}
 */
function createCapturedInflection(isInflected) {
    return createInflection('other', isInflected, (text) => {
        const match = getMatch(isInflected, text);
        return match[1];
    });
}

/**
 * Creates the standard active meN- form. The first consonant of roots
 * beginning with p, t, k, or s is normally absorbed by the nasal prefix.
 * @param {string} root
 * @returns {string}
 */
function createActiveForm(root) {
    if (root.length <= 3) {
        return `menge${root}`;
    }

    switch (root[0]) {
        case 'p':
            return `mem${root.slice(1)}`;
        case 't':
            return `men${root.slice(1)}`;
        case 'k':
            return `meng${root.slice(1)}`;
        case 's':
            return `meny${root.slice(1)}`;
        case 'b':
        case 'f':
        case 'v':
            return `mem${root}`;
        case 'c':
        case 'd':
        case 'j':
        case 'z':
            return `men${root}`;
        case 'g':
        case 'h':
        case 'q':
            return `meng${root}`;
        case 'l':
        case 'm':
        case 'n':
        case 'r':
        case 'w':
        case 'y':
            return `me${root}`;
        default:
            return `meng${root}`;
    }
}

/**
 * @param {string} suffix
 * @returns {import('language-transformer').Rule<Condition>}
 */
function createCliticInflection(suffix) {
    const isInflected = new RegExp(`^[a-z]{3,}${suffix}$`);
    return createInflection('other', isInflected, (text) => text.slice(0, -suffix.length));
}

/**
 * @param {string} prefix
 * @returns {import('language-transformer').Rule<Condition>}
 */
function createAttachedPrefixInflection(prefix) {
    const isInflected = new RegExp(`^${prefix}(?=[a-z]{3,}$)`);
    return createInflection('prefix', isInflected, (text) => text.slice(prefix.length));
}

/**
 * @param {string} suffix
 * @returns {import('language-transformer').Rule<Condition>}
 */
function createSuffixInflection(suffix) {
    const isInflected = new RegExp(`^[a-z]{3,}${suffix}$`);
    return createInflection('other', isInflected, (text) => text.slice(0, -suffix.length));
}

const colloquialSpellingInflections = [
    wholeWordInflection('ga', 'tidak', [], []),
    wholeWordInflection('gak', 'tidak', [], []),
    wholeWordInflection('enggak', 'tidak', [], []),
    wholeWordInflection('nggak', 'tidak', [], []),
    wholeWordInflection('kalo', 'kalau', [], []),
    wholeWordInflection('taun', 'tahun', [], []),
    wholeWordInflection('cape', 'capai', [], []),
    wholeWordInflection('capek', 'capai', [], []),
    wholeWordInflection('menjijikkan', 'menjijikan', [], []),
    createInflection('other', /emen/, (text) => text.replace(/emen/, 'eman')),
];

/** @type {import('language-transformer').LanguageTransformDescriptor<Condition>} */
export const indonesianTransforms = {
    language: 'id',
    conditions,
    transforms: {
        'clitic': {
            name: 'clitic',
            description: 'Attached emphatic, possessive, or pronominal clitic',
            rules: ['lah', 'kah', 'pun', 'ku', 'mu', 'nya'].map(createCliticInflection),
        },
        'numeric reduplication': {
            name: 'numeric reduplication',
            description: 'Informal numeric notation for a repeated word',
            rules: [
                createInflection('wholeWord', /^([a-z]{2,})-?2$/, (text) => {
                    const match = getMatch(/^([a-z]{2,})-?2$/, text);
                    return `${match[1]}-${match[1]}`;
                }),
            ],
        },
        'passive di-': {
            name: 'passive di- → active meN-',
            description: 'Passive verb converted to its corresponding active form',
            rules: [
                createActiveInflection(/^di([a-z]{3,})in$/, '', 'kan'),
                createActiveInflection(/^di([a-z]{3,})in$/, '', 'i'),
                createActiveInflection(/^di([a-z]{3,})$/),
            ],
        },
        'colloquial active verb': {
            name: 'colloquial → active meN-',
            description: 'Colloquial nasal verb converted to a formal active form',
            rules: [
                createActiveInflection(/^nge([a-z]{3,})in$/, '', 'kan'),
                createActiveInflection(/^nge([a-z]{3,})in$/, '', 'i'),
                createActiveInflection(/^ny([a-z]{2,})in$/, 'c', 'kan'),
                createActiveInflection(/^ny([a-z]{2,})in$/, 'c', 'i'),
                createActiveInflection(/^ny([a-z]{2,})in$/, 's', 'kan'),
                createActiveInflection(/^ny([a-z]{2,})in$/, 's', 'i'),
                createActiveInflection(/^ng(?!e)([a-z]{3,})in$/, '', 'kan'),
                createActiveInflection(/^ng(?!e)([a-z]{3,})in$/, '', 'i'),
                createActiveInflection(/^n(?!g|y)([a-z]{3,})in$/, 't', 'kan'),
                createActiveInflection(/^n(?!g|y)([a-z]{3,})in$/, 't', 'i'),
                createActiveInflection(/^n(?!g|y)([a-z]{3,})in$/, 'c', 'kan'),
                createActiveInflection(/^n(?!g|y)([a-z]{3,})in$/, 'c', 'i'),
                createActiveInflection(/^m(?!e)([a-z]{3,})in$/, 'p', 'kan'),
                createActiveInflection(/^m(?!e)([a-z]{3,})in$/, 'p', 'i'),
                createActiveInflection(/^m(?!e)([a-z]{3,})in$/, 'b', 'kan'),
                createActiveInflection(/^m(?!e)([a-z]{3,})in$/, 'b', 'i'),
                createActiveInflection(/^nge(?![a-z]*in$)([a-z]{2,})$/),
                createActiveInflection(/^ny(?![a-z]*in$)([a-z]{2,})$/, 'c'),
                createActiveInflection(/^ny(?![a-z]*in$)([a-z]{2,})$/, 's'),
                createActiveInflection(/^ng(?!e)(?![a-z]*in$)([a-z]{3,})$/),
                createActiveInflection(/^n(?!g|y)(?![a-z]*in$)([a-z]{3,})$/, 't'),
                createActiveInflection(/^n(?!g|y)(?![a-z]*in$)([a-z]{3,})$/, 'c'),
                createActiveInflection(/^m(?!e)(?![a-z]*in$)([a-z]{3,})$/, 'p'),
                createActiveInflection(/^m(?!e)(?![a-z]*in$)([a-z]{3,})$/, 'b'),
            ],
        },
        'imperative active verb': {
            name: 'imperative → active meN-',
            description: 'Suffixed imperative converted to a formal active form',
            rules: [
                createInflection('other', /^per([a-z]{3,})(kan|i)$/, (text) => {
                    const match = getMatch(/^per([a-z]{3,})(kan|i)$/, text);
                    return `memper${match[1]}${match[2]}`;
                }, ['v']),
                createInflection('other', /^(?!(?:di|memper|menge|meny|meng|men|mem|me|ber|ter|per))([a-z]{3,})(kan|i)$/, (text) => {
                    const match = getMatch(/^([a-z]{3,})(kan|i)$/, text);
                    return createActiveForm(match[1]) + match[2];
                }, ['v']),
            ],
        },
        'informal -in': {
            name: 'informal -in',
            description: 'Colloquial -in suffix converted to formal -kan or -i',
            rules: [
                suffixInflection('in', 'kan', [], []),
                suffixInflection('in', 'i', [], []),
            ],
        },
        'ke- → ter-': {
            name: 'ke- → ter-',
            description: 'Colloquial ke- verb converted to formal ter-',
            rules: [
                createInflection('prefix', /^ke(?!tidak)(?=[a-z]{3,}$)/, (text) => `ter${text.slice(2)}`),
            ],
        },
        'colloquial spelling': {
            name: 'colloquial spelling',
            description: 'Common colloquial spelling converted to its formal form',
            rules: colloquialSpellingInflections,
        },
        'reduplication': {
            name: 'reduplication',
            description: 'Repeated word converted to its unreduplicated form',
            rules: [
                createCapturedInflection(/^(?:ber|ter|se|ke|di)([a-z]{2,})-[a-z]{2,}(?:an|kan|i)?$/),
                createCapturedInflection(/^([a-z]{2,})-[a-z]{2,}(?:an|kan|i)?$/),
            ],
        },
        'ku-/kau-/ga-': {
            name: 'ku-/kau-/ga-',
            description: 'Attached pronoun or colloquial negator',
            rules: [
                createAttachedPrefixInflection('kau'),
                createAttachedPrefixInflection('ku'),
                createAttachedPrefixInflection('nggak'),
                createAttachedPrefixInflection('gak'),
                createAttachedPrefixInflection('ga'),
            ],
        },
        'colloquial nasal prefix': {
            name: 'colloquial nasal prefix',
            rules: [
                createRestoredPrefixInflection(/^nge([a-z]{2,})$/, ''),
                createRestoredPrefixInflection(/^ny([a-z]{2,})$/, 'c'),
                createRestoredPrefixInflection(/^ny([a-z]{2,})$/, 's'),
                createRestoredPrefixInflection(/^ng(?!e)([a-z]{3,})$/, ''),
                createRestoredPrefixInflection(/^ng(?!e)([a-z]{3,})$/, 'k'),
                createRestoredPrefixInflection(/^n(?!g|y)([a-z]{3,})$/, 't'),
                createRestoredPrefixInflection(/^n(?!g|y)([a-z]{3,})$/, 'c'),
                createRestoredPrefixInflection(/^n(?!g|y)([a-z]{3,})$/, 'd'),
                createRestoredPrefixInflection(/^n(?!g|y)([a-z]{3,})$/, 'j'),
                createRestoredPrefixInflection(/^m(?!e)([a-z]{3,})$/, 'p'),
                createRestoredPrefixInflection(/^m(?!e)([a-z]{3,})$/, 'b'),
            ],
        },
        'meN-': {
            name: 'meN-',
            description: 'Active verbal prefix',
            rules: [
                createRestoredPrefixInflection(/^memper([a-z]{3,})$/, 'per'),
                createRestoredPrefixInflection(/^menge([a-z]{2,})$/, ''),
                createRestoredPrefixInflection(/^meny([a-z]{2,})$/, 's'),
                createRestoredPrefixInflection(/^meny([a-z]{2,})$/, 'c'),
                createRestoredPrefixInflection(/^meny([a-z]{2,})$/, ''),
                createRestoredPrefixInflection(/^meng(?!e)([a-z]{2,})$/, ''),
                createRestoredPrefixInflection(/^meng(?!e)([a-z]{2,})$/, 'k'),
                createRestoredPrefixInflection(/^men(?!g|y)([aeiou][a-z]{2,})$/, 't'),
                createRestoredPrefixInflection(/^men(?!g|y)([a-z]{3,})$/, ''),
                createRestoredPrefixInflection(/^mem(?!per)([aeiou][a-z]{2,})$/, 'p'),
                createRestoredPrefixInflection(/^mem(?!per)([a-z]{3,})$/, ''),
                createRestoredPrefixInflection(/^me(?!m|n)([a-z]{3,})$/, ''),
            ],
        },
        'peN-': {
            name: 'peN-',
            description: 'Nominal peN- prefix',
            rules: [
                createRestoredPrefixInflection(/^penge([a-z]{2,})$/, ''),
                createRestoredPrefixInflection(/^peny([a-z]{2,})$/, 's'),
                createRestoredPrefixInflection(/^peny([a-z]{2,})$/, 'c'),
                createRestoredPrefixInflection(/^peny([a-z]{2,})$/, ''),
                createRestoredPrefixInflection(/^peng(?!e)([a-z]{2,})$/, ''),
                createRestoredPrefixInflection(/^peng(?!e)([a-z]{2,})$/, 'k'),
                createRestoredPrefixInflection(/^pen(?!g|y)([aeiou][a-z]{2,})$/, 't'),
                createRestoredPrefixInflection(/^pen(?!g|y)([a-z]{3,})$/, ''),
                createRestoredPrefixInflection(/^pem([aeiou][a-z]{2,})$/, 'p'),
                createRestoredPrefixInflection(/^pem([a-z]{3,})$/, ''),
                createRestoredPrefixInflection(/^pe(?!m|n)([a-z]{3,})$/, ''),
            ],
        },
        'ber-/per-/ter-': {
            name: 'ber-/per-/ter-',
            description: 'Verbal or nominal r-prefix',
            rules: [
                wholeWordInflection('belajar', 'ajar', [], []),
                wholeWordInflection('bekerja', 'kerja', [], []),
                createRestoredPrefixInflection(/^be(r[a-z]{2,})$/, ''),
                createRestoredPrefixInflection(/^pe(r[a-z]{2,})$/, ''),
                createRestoredPrefixInflection(/^te(r[a-z]{2,})$/, ''),
                prefixInflection('ber', '', [], []),
                prefixInflection('per', '', [], []),
                prefixInflection('ter', '', [], []),
            ],
        },
        'circumfix': {
            name: 'circumfix',
            description: 'Prefix and suffix removed together',
            rules: [
                createCapturedInflection(/^ketidak([a-z]{3,})an$/),
                createCapturedInflection(/^ke([a-z]{3,})an$/),
                createCapturedInflection(/^ber([a-z]{3,})an$/),
                createCapturedInflection(/^per([a-z]{3,})an$/),
            ],
        },
        'simple prefix': {
            name: 'simple prefix',
            rules: [
                prefixInflection('ketidak', '', [], []),
                prefixInflection('di', '', [], []),
                prefixInflection('se', '', [], []),
                prefixInflection('ke', '', [], []),
            ],
        },
        'derivational suffix': {
            name: 'derivational suffix',
            rules: ['kan', 'an', 'i'].map(createSuffixInflection),
        },
    },
};
