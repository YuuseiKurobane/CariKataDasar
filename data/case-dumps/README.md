# Case dumps

Keep small, source-specific CSV files here, for example:

- `initial_prompt.csv`
- `community1.csv`
- `try1_0-10k.csv`

Every CSV requires `token` and `expected_result` columns. Their order does not
matter. Other columns, such as `notes`, are allowed and ignored by the
materializer.

Rows are enabled by default. Set an optional `enabled` value to `false`, `no`,
`n`, `off`, `0`, or `disabled` (case-insensitive) to skip a row. Empty rows
and rows without both required values are also skipped.

Run `npm run materialize:cases` to merge the enabled rows into
`data/cases/regression.csv`. Duplicate `token`/`expected_result` pairs are
written only once.
