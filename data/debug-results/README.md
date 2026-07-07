# Debug results

`npm run debug:traces` writes `<source>_result.txt` files here from
`data/debug-dumps/*.txt`, plus `_combined_debug.txt`.

Per-source results keep raw input order within fatal rows and within hit rows.
The combined file sorts fatal rows alphabetically first, then hit rows
alphabetically after them.
