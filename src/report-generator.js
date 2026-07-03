import {indonesianCandidateGenerator} from './candidate-generator.js';

/**
 * Resolve one corpus token against an exact headword index.
 *
 * @param {string} token
 * @param {number} occurrences
 * @param {{headwords: Set<string>, sourcesByHeadword: Map<string, string[]>}} index
 * @param {{generate(token: string): {rank: number, text: string}[]}} [generator]
 * @returns {{
 *   token: string,
 *   occurrences: number,
 *   resolution: string|null,
 *   resolutionRank: number|null,
 *   resolutionSources: string[],
 *   candidates: ReturnType<generator['generate']>,
 * }}
 */
export function resolveToken(
    token,
    occurrences,
    index,
    generator = indonesianCandidateGenerator,
) {
    const candidates = generator.generate(token);
    const resolved = candidates.find(({text}) => index.headwords.has(text));
    const resolution = resolved?.text ?? null;

    return {
        token,
        occurrences,
        resolution,
        resolutionRank: resolved?.rank ?? null,
        resolutionSources: resolution === null
            ? []
            : (index.sourcesByHeadword.get(resolution) ?? []),
        candidates,
    };
}

/**
 * Flatten a resolution for the human-facing wide CSV.
 *
 * @param {ReturnType<typeof resolveToken>} result
 * @returns {Record<string, string|number>}
 */
export function createWideReportRecord(result) {
    const record = {
        token: result.token,
        occurrences: result.occurrences,
        resolution: result.resolution ?? '',
        resolution_rank: result.resolutionRank ?? '',
        resolution_sources: result.resolutionSources.join('|'),
        candidate_count: result.candidates.length,
    };
    for (const {rank, text} of result.candidates) {
        record[`word${rank}`] = text;
    }
    return record;
}

