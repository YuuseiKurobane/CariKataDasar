# Debug dumps

Keep one token per line in `.txt` files here. `npm run debug:traces` reads
these files and writes parser hit traces to `data/debug-results/`.

Files ending in `_result.txt` are ignored so generated output can never be fed
back into the debug process by accident.
