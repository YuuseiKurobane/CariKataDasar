# CariKataDasar

CariKataDasar is a standalone test harness for Yomitan's Indonesian candidate
generator. Its main job is to find real corpus tokens that cannot be resolved
to known Indonesian headwords, and to expose candidate-ordering problems.

The project deliberately treats two questions separately:

1. Did the parser generate a real candidate?
2. If it did, how early did that candidate appear?

Generating implausible extra candidates is not itself considered a failure.

## Requirements

- Node.js 22 or newer
- Python 3.11 or newer only when rebuilding the mc4-id frequency corpus

No npm dependencies are required for the current harness.

## Quick start

```powershell
npm run check:upstream
npm test
npm run build:headwords
```

`build:headwords` reads every `.txt` file in `data/headwords/sources` and
creates:

- `data/generated/headwords_combined.txt`
- `data/generated/headword_provenance.jsonl`

Matching is exact and case-sensitive. Yomitan-compatible capitalization and
diacritic preprocessing happens during candidate generation instead of while
building the index.

## Repository layout

- `src/yomitan/`: the minimal pinned Yomitan runtime and editable Indonesian
  transforms.
- `src/candidate-generator.js`: reproduces Indonesian preprocessing,
  transformation order, and first-occurrence candidate deduplication.
- `src/headword-index.js`: exact headword set with source provenance.
- `src/report-generator.js`: resolves tokens against the candidate sequence.
- `data/headwords/sources/`: raw headword lists.
- `data/cases/`: community and regression cases.
- `tools/corpus/mc4-id/`: the existing deterministic corpus counter.
- `reports/`: generated human-facing reports.

The original planning prompts are retained in `docs/initial-prompts`.

## Corpus data

The completed mc4-id run remains under
`tools/corpus/mc4-id/run-v1` so its manifest, checkpoints, merge database, and
final frequency table stay together. This directory is ignored by Git.

To rebuild it on another machine:

1. Copy `tools/corpus/mc4-id/config.example.json` to `config.json`.
2. Set `corpus_dir` to the local mc4-id shard directory.
3. Run the commands documented in `tools/corpus/mc4-id/README.md`.

## Upstream synchronization

`UPSTREAM.md` records the source Yomitan commit and hashes. The Indonesian
transform file is intentionally editable; the remaining vendored runtime
files should stay byte-identical to upstream.

