# Frequency inputs

The raw deterministic mc4-id count is kept with its resumable run artifacts at:

`mc4-id-naive-frequency/run-v1/token_frequencies.csv.gz`

The project-facing preprocessing command is:

`npm run prepare:frequencies`

It runs `scripts/prepare-debug-frequencies.py` to write the complete cleaned
frequency table to:

`data/frequency/cleaned_token_frequencies.csv.gz`

It then runs `scripts/prepare-review-cases.mjs` to discard lowercased tokens
that exactly match a configured headword and materialize:

- `data/review/corpus-review-seed.csv`
- `data/review/batches/corpus-review-*.csv`

The script always reads the full raw table before applying the aggregated
occurrence threshold because case variants may combine above the cutoff.
