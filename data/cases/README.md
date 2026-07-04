# Regression cases

There are two project-facing regression inputs:

1. `community-dump.txt`: newline-separated raw community submissions.
2. `community.csv`: machine-facing community regression cases with exactly
   `token,expected_result`.

Curated corpus regression cases are generated, not edited manually:

1. Blank review batches are generated under `data/review/batches/`.
2. Human or LLM-labeled copies belong under `data/review/labeled/`.
3. `npm run materialize:cases` reads every existing
   `data/review/labeled/corpus-review-*.csv`.
4. Rows marked `is_interesting=y` with a non-empty `expected_result` become
   `corpus-curated.csv`.

`npm test` loads both `community.csv` and `corpus-curated.csv` and checks only
that each expected real headword appears among the generated candidates.
