# Raw mc4-id surface-token frequencies

This directory implements only the reusable first stage: read all configured
mc4-id JSONL.GZ shards and write:

```csv
token,occurrences
```

It does not load KBBI while counting, call CariKataDasar, normalize, stem,
case-fold, remove digits, or use any legacy map/cache. The final file is sorted
by occurrence count descending and exact token ascending.

## Token boundary policy (version 1)

A token:

1. starts with a Unicode alphanumeric character (underscore is excluded);
2. continues through Unicode alphanumeric characters and combining marks;
3. may contain an apostrophe or hyphen only between alphanumeric runs.

The internal joiners are exactly:

- ASCII apostrophe (`'`)
- modifier letter apostrophe (`U+02BC`)
- right single quotation mark (`U+2019`)
- ASCII hyphen-minus (`-`)
- Unicode hyphen (`U+2010`)
- non-breaking hyphen (`U+2011`)

En/em dashes, slashes, dots, underscores, `@`, and other punctuation are
boundaries. Tokens are exact slices of the source: `Aku` and `aku`, NFC `é` and
NFD `e + combining acute`, and distinct hyphen characters stay distinct.
Numbers remain tokens and may be mixed with letters (`liputan6`).

Only the JSON object's string-valued `text` field is tokenized. Other fields
such as `url` are never used. Invalid UTF-8 is decoded with `U+FFFD`, which is a
token boundary; malformed JSON and records without string text are counted in
checkpoint metrics and skipped.

Any tokenizer-policy change requires a new tokenizer version and a new output
directory. It also requires rescanning mc4-id.

## Run

Review `config.json`, especially the corpus and output paths. Then run:

```powershell
py raw_token_frequencies.py count
```

The configured 1,024-shard count is checked before work starts. `run-v1`
contains:

- `manifest.json`: corpus inventory, tokenizer/Unicode versions, code hash,
  metrics, final checksum, and final totals;
- `workers/`: deterministic worker file lists and statuses;
- `checkpoints/`: atomic per-shard counts/states and the current in-shard
  snapshot while a shard is running;
- `merge/counts.sqlite3`: disk-backed, per-shard transactional merge state;
- `token_frequencies.csv.gz`: deterministic UTF-8 gzip CSV.

Rerun the same command after interruption. Completed shards are checksum
verified and skipped. An interrupted shard reloads its latest count snapshot,
decompresses past already-seen lines, and continues without recounting them.
The SQLite merge likewise skips transactionally merged shards.

To retry only the merge/export:

```powershell
py raw_token_frequencies.py merge
```

The manifest refuses to mix changed corpus inventories, code, Unicode
databases, or tokenizers in one output directory. Start a new output directory
for a changed run.

## Tests

These tests use only tiny temporary shards:

```powershell
py -m unittest discover -s tests -v
```

## Exact clean-KBBI intersection

After the raw table exists:

```powershell
py intersect_kbbi.py run-v1\token_frequencies.csv.gz `
  --output run-v1\kbbi_exact_token_frequencies.csv.gz
```

This command loads only `term_bank_1.json` through `term_bank_99.json` from
`..\4plus`, excluding legacy redirect banks 100–125. It requires exactly
112,647 unique clean headwords and performs an exact, case-sensitive
intersection without normalization.
