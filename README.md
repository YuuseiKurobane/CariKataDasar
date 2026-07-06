# CariKataDasar

CariKataDasar is a standalone test harness for Yomitan's Indonesian candidate
generator. Its main job is to turn real corpus tokens and manually or
LLM-discovered inconsistencies into regression cases that expose missing
headwords and candidate-order problems.

Regression cases record the complete sequence of generated candidates that
resolve against the current CKD headword set. Tests preserve candidate order
and continue collecting hits after the first one.

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
LLM review results are transcribed into descriptively named text files under
`data/case-dumps/`, such as `initial_prompt.txt`, `manual_2026-07-06.txt`, or
`corpus_review_0-10k.txt`.

After labeling, run:

```powershell
npm test
```

Before running the tests, that command reads every text file in
`data/case-dumps/` and generates:

`data/cases/_combined.txt`

The original 10k review batches remain unchanged as reusable review input.

## Case dump workflow

Keep each manually or LLM-discovered group in a small, descriptively named
file under:

`data/case-dumps/`

Each non-empty line is one case:

`token, hit1, hit2, ...`

There is no header. The first word is the input token, which must also be the
first generated candidate. Every word after it is a generated candidate that
exists in the current CKD headword set, in exact traversal order. Generated
candidates that miss the headword set are omitted, and collection continues
after every hit. A line containing only the token asserts that no generated
candidate resolves. If the token is itself a headword, it appears again as the
first hit.

For example:

`dirikan, mendirikan, diri`

`npm test` scans all `data/case-dumps/*.txt`, deduplicates identical cases, and
writes the generated regression suite to `data/cases/_combined.txt` before
running the tests. A case fails if the actual ordered hit sequence differs in
any position, has a missing hit, or has an extra hit. A case whose only hit is
the token itself produces a redundancy warning, not a failure.

## Repository layout

- `src/yomitan/`: the minimal pinned Yomitan runtime and editable Indonesian
  transforms.
- `src/candidate-generator.js`: reproduces Indonesian preprocessing,
  transformation order, and first-occurrence candidate deduplication.
- `src/headword-index.js`: exact headword set with source provenance.
- `src/report-generator.js`: resolves tokens against the candidate sequence.
- `src/case-files.js`: ordered parser-case text and review CSV file helpers.
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
