# Case dumps

Keep small, source-specific CSV files here, for example:

- `initial_prompt.csv`
- `manual_2026-07-06.csv`
- `corpus_review_0-10k.csv`

Every CSV requires `token` and `expected_result` columns. Their order does not
matter. Other columns, such as `notes`, are allowed and ignored by the
materializer.

Rows are enabled by default. Set an optional `enabled` value to `false`, `no`,
`n`, `off`, `0`, or `disabled` (case-insensitive) to skip a row. Empty rows
and rows without both required values are also skipped.

Run `npm test` to merge the enabled rows into `data/cases/_combined.csv` before
the tests run. Duplicate `token`/`expected_result` pairs are written only once.

`expected_result` must be the first generated candidate that resolves against
the current CKD headword set. The case fails if no candidate resolves or if a
different candidate resolves first. A case where the token is already a
headword and `expected_result` equals the token produces a redundancy warning,
not a failure.
