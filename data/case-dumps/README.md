# Case dumps

Keep small, source-specific text files here, for example:

- `initial_prompt.txt`
- `manual_2026-07-06.txt`
- `corpus_review_0-10k.txt`

Each non-empty line has this format, with no header:

`token, hit1, hit2, ...`

The first word is the input token and must be the first candidate tried. The
remaining words are every generated candidate found in the current CKD
headword set, in traversal order. Omit generated candidates that do not hit,
but continue recording hits after the first one. A token-only line asserts
that there are no hits. If the token is itself a headword, repeat it immediately
after the token as the first hit.

Run `npm test` to merge all `*.txt` dumps into
`data/cases/_combined.txt` before the tests run. Identical cases are written
only once. The test fails on any missing, extra, or out-of-order hit.

If a case's only hit is the token itself, the test emits a redundancy warning
without failing for that reason.
