# Testcase dumps

Keep small, source-specific text files here, for example:

- `initial_prompt.txt`
- `manual_2026-07-06.txt`
- `corpus_review_0-10k.txt`

Each non-empty line has this format, with no header:

`token, hit1, hit2, ...`

The first word is the input token and must be the first candidate tried. The
unbracketed words after it are the strict hit prefix: the parser must resolve
those headword hits first, in that exact order. Omit generated candidates that
do not hit the headword set.

The final entry may be a fuzzy tail group:

`token, strict1, strict2, (tail1, tail2, ...)`

Tail words inside `()` may appear in any order, but they must appear somewhere
after the strict prefix. Extra hits after the strict prefix are allowed. Fuzzy
brackets are only valid as the final entry; a bracketed group before the tail
is a syntax error.

If the token is itself a headword, repeat it immediately after the token when
you want to assert that it is the first hit. A token-only line has no strict
prefix and no fuzzy tail requirements.

Examples:

`dirikan, dirikan, merikan, diri`

`diberikan, diberikan, memberikan, (berikan, diberi, beri)`

Run `npm test` to merge all `*.txt` dumps into
`data/testcases-results/_combined_testcases.txt` before the tests run. Identical cases are written
only once. The test fails when the strict prefix is missing or out of order, or
when a fuzzy tail word is missing after the strict prefix. Extra tail hits are
tolerated.

If a case's only strict hit is the token itself, the test emits a redundancy
warning without failing for that reason.
