# CariKataDasar

CariKataDasar is a standalone test harness for Yomitan's Indonesian candidate
generator. Its main job is to turn real corpus tokens and manually or
LLM-discovered inconsistencies into regression cases that expose missing
headwords and candidate-order problems.

Regression cases test which generated candidate resolves first against the
current CKD headword set. An extra candidate is a failure when it is a
headword and resolves before the expected result.

## Requirements

- Node.js 22 or newer
- Python 3.11 or newer when rebuilding the raw mc4-id table or preparing
  cleaned review inputs

No npm dependencies are required for the current harness.

## Quick start

```powershell
npm run check:upstream
npm run build:headwords
npm run prepare:frequencies
npm test
```

`build:headwords` reads every `.txt` file in `data/headwords/sources` and
creates:

- `data/generated/headwords_combined.txt`
- `data/generated/headword_provenance.jsonl`

Matching is exact and case-sensitive. Yomitan-compatible capitalization and
diacritic preprocessing happens during candidate generation instead of while
building the index.

## Corpus review workflow

The raw deterministic token count remains under:

`mc4-id-naive-frequency/run-v1/token_frequencies.csv.gz`

`npm run prepare:frequencies` reads that file, lowercases and aggregates exact
surface forms, filters to tokens containing at least one ASCII lowercase
letter and aggregated occurrences greater than 100, then writes:

- `data/frequency/cleaned_token_frequencies.csv.gz`
- `data/review/corpus-review-seed.csv`
- `data/review/batches/corpus-review-0-10k.csv`
- `data/review/batches/corpus-review-10-20k.csv`
- ...
- `data/review/batches/corpus-review-90-100k.csv`

The cleaned frequency table retains every token that passes those corpus
filters. The review CSVs exclude only lowercased surface forms that exactly
match a configured headword. Transform-derived candidates are not used for
this filtering.

The generated review CSVs use exactly these columns:

`token,occurrences,expected_result,is_interesting`

Blank generated review batches stay in `data/review/batches/`. Human or
LLM review happens in copies with descriptive filenames under
`data/case-dumps/`, such as `initial_prompt.csv`, `manual_2026-07-06.csv`, or
`corpus_review_0-10k.csv`. A dump only needs the `token` and `expected_result`
columns, so review-only columns can be removed or left in place.

After labeling, run:

```powershell
npm test
```

Before running the tests, that command reads every CSV file in
`data/case-dumps/` and generates:

`data/cases/_combined.csv`

The original 10k review batches remain unchanged as reusable review input.

## Case dump workflow

Keep each manually or LLM-discovered group in a small, descriptively named
file under:

`data/case-dumps/`

Each CSV requires these columns, in either order:

`token,expected_result`

Optional columns such as `enabled`, `notes`, `occurrences`, or
`is_interesting` are allowed. Unknown columns are ignored. Rows are included
by default; set `enabled` to `false`, `no`, `n`, `off`, `0`, or `disabled` to
skip one. Empty rows and rows missing either required value are ignored.

`npm test` scans all `data/case-dumps/*.csv`, deduplicates identical
`token`/`expected_result` pairs, and writes the generated regression suite to
`data/cases/_combined.csv` before running the tests.

For each case, `expected_result` is the first generated candidate that resolves
against the current CKD headword set. A case fails if no candidate resolves or
if a different candidate resolves first. If the token itself is already a
headword and `expected_result` equals the token, the test warns that the case is
probably redundant but does not fail for that reason.

## Repository layout

- `src/yomitan/`: the minimal pinned Yomitan runtime and editable Indonesian
  transforms.
- `src/candidate-generator.js`: reproduces Indonesian preprocessing,
  transformation order, and first-occurrence candidate deduplication.
- `src/headword-index.js`: exact headword set with source provenance.
- `src/report-generator.js`: resolves tokens against the candidate sequence.
- `src/case-files.js`: CSV loaders and writers for regression-case files.
- `data/headwords/sources/`: raw headword lists.
- `data/review/`: generated review queues and 10k review-input batches.
- `data/case-dumps/`: source-specific accepted case dumps.
- `data/cases/`: generated merged regression cases.
- `mc4-id-naive-frequency/`: the deterministic raw corpus counter.
- `reports/`: optional ad hoc outputs outside the core review loop.

The original planning prompts are retained in `docs/initial-prompts`.

## Rebuilding the raw frequency table

To rebuild the raw count on another machine:

1. Copy `mc4-id-naive-frequency/config.example.json` to `config.json`.
2. Set `corpus_dir` to the local mc4-id shard directory.
3. Run the commands documented in `mc4-id-naive-frequency/README.md`.

## Upstream synchronization

`UPSTREAM.md` records the source Yomitan commit and hashes. The Indonesian
transform file is intentionally editable; the remaining vendored runtime
files should stay byte-identical to upstream.
