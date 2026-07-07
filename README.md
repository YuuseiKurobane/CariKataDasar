# CariKataDasar

CariKataDasar is a standalone test harness for Yomitan's Indonesian candidate
generator. Its main job is to turn real corpus tokens and manually or
LLM-discovered inconsistencies into regression cases that expose missing
headwords and candidate-order problems.

Regression cases assert the important head of the generated hit sequence while
allowing known low-value tail debris. Tests preserve candidate order for the
strict prefix and can also require unordered hits later in the tail.

## Requirements

- Node.js 22 or newer
- Python 3.11 or newer when rebuilding the raw mc4-id table or preparing
  cleaned review inputs

No npm dependencies are required for the current harness.

## Quick start

```powershell
npm run check:upstream
npm run build:headwords
npm run debug:traces
npm test
```

`build:headwords` reads every `.txt` file in `data/headwords/sources` and
creates:

- `data/generated/headwords_combined.txt`
- `data/generated/headword_provenance.jsonl`

Matching is exact and case-sensitive. Yomitan-compatible capitalization and
diacritic preprocessing happens during candidate generation instead of while
building the index.

## Debug trace workflow

Keep one token per line in descriptively named `.txt` files under:

`data/debug-dumps/`

Run:

```powershell
npm run debug:traces
```

That command reads every `data/debug-dumps/*.txt` file except files ending in
`_result.txt`, deduplicates repeated tokens with the earliest occurrence
winning, and writes:

- `data/debug-results/<source>_result.txt`
- `data/debug-results/_combined_debug.txt`

Each result line shows the input token followed by every generated candidate
that resolves against the current headword set, in parser order:

`diberikan, memberikan, berikan, diberi, ikan, beri`

Generated candidates that miss the headword set are omitted. Lines with no
headword hit are moved to the top of each result file and use this exact
no-comma fatal form:

`zzzzzzzzzzzzzzzzzzzzzzzzzzz FATAL ERROR GAK DAPET HIT CUY`

Per-source result files preserve the original input order within the fatal
group and within the hit group. `_combined_debug.txt` combines unique tokens
from all debug dumps, then sorts fatal rows alphabetically first and hit rows
alphabetically after them.

Reviewed hit rows can be copied into `data/testcases-dump/` as accepted
testcases. Fatal rows are intentionally not testcase-compatible and need human
review.

## Corpus review workflow

This workflow is for finding more candidate testcases from the mc4-id corpus;
it is not required for the usual Yomitan parser audit loop.

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
`data/testcases-dump/`, such as `initial_prompt.txt`, `manual_2026-07-06.txt`, or
`corpus_review_0-10k.txt`.

After labeling, run:

```powershell
npm test
```

Before running the tests, that command reads every text file in
`data/testcases-dump/` and generates:

`data/testcases-results/_combined_testcases.txt`

The original 10k review batches remain unchanged as reusable review input.

## Testcase dump workflow

Keep each manually or LLM-discovered group in a small, descriptively named
file under:

`data/testcases-dump/`

Each non-empty line is one case:

`token, hit1, hit2, ...`

There is no header. The first word is the input token, which must also be the
first generated candidate. Every unbracketed word after it is a strict hit
prefix: those hits must resolve in exactly that order before any other
headword hits appear. Generated candidates that miss the headword set are
omitted from the case text.

Optionally, the final entry may be a fuzzy tail group:

`token, strict1, strict2, (tail1, tail2, ...)`

Bracketed tail words may appear in any order, but they must resolve somewhere
after the strict prefix. Extra generated hits after the strict prefix are
tolerated. Fuzzy brackets are only valid as the final entry; a bracketed group
in the strict prefix is a syntax error.

If the token is itself a headword, repeat it immediately after the token when
you want to assert that it is the first hit. A line containing only the token
asserts no hit prefix and no fuzzy tail requirements.

For example:

`dirikan, dirikan, merikan, diri`

`diberikan, diberikan, memberikan, (berikan, diberi, beri)`

`npm test` scans all `data/testcases-dump/*.txt`, deduplicates identical cases, and
writes the generated regression suite to `data/testcases-results/_combined_testcases.txt` before
running the tests. A case fails if the strict prefix does not match the first
resolved hits or if any fuzzy tail word is missing after that prefix. Extra
tail hits do not fail the test. A case whose only strict hit is the token
itself produces a redundancy warning, not a failure.

## Repository layout

- `src/yomitan/`: the minimal pinned Yomitan runtime and editable Indonesian
  transforms.
- `src/candidate-generator.js`: reproduces Indonesian preprocessing,
  transformation order, and first-occurrence candidate deduplication.
- `src/headword-index.js`: exact headword set with source provenance.
- `src/report-generator.js`: resolves tokens against the candidate sequence.
- `src/case-files.js`: parser-case text and review CSV file helpers.
- `data/headwords/sources/`: raw headword lists.
- `data/review/`: generated review queues and 10k review-input batches.
- `data/debug-dumps/`: source-specific raw token lists for debug traces.
- `data/debug-results/`: generated debug traces for review.
- `data/testcases-dump/`: source-specific accepted testcase dumps.
- `data/testcases-results/`: generated merged regression testcases.
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
