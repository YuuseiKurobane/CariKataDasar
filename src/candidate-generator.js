import {
    capitalizeFirstLetter,
    decapitalize,
    removeAlphabeticDiacritics,
} from './yomitan/language/text-processors.js';
import {LanguageTransformer} from './yomitan/language/language-transformer.js';
import {indonesianTransforms} from './yomitan/language/id/indonesian-transforms.js';

const INDONESIAN_PREPROCESSORS = [
    ['decapitalize', decapitalize],
    ['capitalizeFirstLetter', capitalizeFirstLetter],
    ['removeAlphabeticDiacritics', removeAlphabeticDiacritics],
];

/**
 * Reproduces the ordering and first-chain behavior of Translator._getTextVariants
 * for Indonesian's configured preprocessors.
 *
 * @param {string} text
 * @returns {{text: string, preprocessors: string[]}[]}
 */
export function getIndonesianTextVariants(text) {
    let variants = new Map([[text, []]]);

    for (const [id, {process}] of INDONESIAN_PREPROCESSORS) {
        const nextVariants = new Map();
        for (const [variant, chain] of variants) {
            for (const processed of process(variant)) {
                if (nextVariants.has(processed)) {
                    continue;
                }
                nextVariants.set(
                    processed,
                    processed === variant ? chain : [...chain, id],
                );
            }
        }
        variants = nextVariants;
    }

    return [...variants].map(([variant, preprocessors]) => ({
        text: variant,
        preprocessors,
    }));
}

export class IndonesianCandidateGenerator {
    constructor() {
        this._transformer = new LanguageTransformer();
        this._transformer.addDescriptor(indonesianTransforms);
    }

    /**
     * Generate unique candidates in the order Yomitan queries them.
     *
     * @param {string} token
     * @returns {{
     *   rank: number,
     *   text: string,
     *   preprocessors: string[],
     *   transforms: string[],
     *   conditions: number,
     * }[]}
     */
    generate(token) {
        const seen = new Set();
        const candidates = [];

        for (const variant of getIndonesianTextVariants(token)) {
            for (const {text, trace, conditions} of this._transformer.transform(variant.text)) {
                if (seen.has(text)) {
                    continue;
                }
                seen.add(text);
                candidates.push({
                    rank: candidates.length + 1,
                    text,
                    preprocessors: variant.preprocessors,
                    transforms: trace.map(({transform}) => transform),
                    conditions,
                });
            }
        }

        return candidates;
    }
}

export const indonesianCandidateGenerator = new IndonesianCandidateGenerator();

