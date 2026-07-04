# CariKataDasar

CariKataDasar is a standalone test harness for Yomitan's Indonesian candidate
generator. Its main job is to turn real corpus tokens and community reports
into small regression suites that expose missing headwords and candidate-order
problems.

The project deliberately treats two questions separately:

1. Did the parser generate a real candidate?
2. If it did, how early did that candidate appear?

Generating implausible extra candidates is not itself considered a failure.

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
npm run materialize:cases
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
LLM-labeled copies belong in `data/review/labeled/` with the same filenames.

After labeling, run:

```powershell
npm run materialize:cases
```

That command reads every existing `data/review/labeled/corpus-review-*.csv`
file and generates:

`data/cases/corpus-curated.csv`

Only rows marked `is_interesting=y` with a non-empty `expected_result` become
regression cases.

## Community workflow

Raw community submissions belong in:

`data/cases/community-dump.txt`

The machine-facing regression suite belongs in:

`data/cases/community.csv`

Its columns are:

`token,expected_result`

`npm test` loads both `community.csv` and `corpus-curated.csv` and asserts only
that each expected real headword appears somewhere in the generated candidate
list.

## Repository layout

- `src/yomitan/`: the minimal pinned Yomitan runtime and editable Indonesian
  transforms.
- `src/candidate-generator.js`: reproduces Indonesian preprocessing,
  transformation order, and first-occurrence candidate deduplication.
- `src/headword-index.js`: exact headword set with source provenance.
- `src/report-generator.js`: resolves tokens against the candidate sequence.
- `src/case-files.js`: CSV loaders and writers for regression-case files.
- `data/headwords/sources/`: raw headword lists.
- `data/review/`: generated review queues and labeled review batches.
- `data/cases/`: community and curated regression cases.
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
