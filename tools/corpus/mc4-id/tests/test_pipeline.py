from __future__ import annotations

import gzip
import json
import tempfile
import unittest
from pathlib import Path

from io_utils import iter_count_csv
from raw_token_frequencies import (
    discover_shards,
    merge_checkpoints,
    process_shard,
    run_workers,
)


class TinyPipelineTests(unittest.TestCase):
    def test_count_resume_outputs_and_deterministic_merge(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            corpus = root / "corpus"
            output = root / "run"
            corpus.mkdir()

            records = [
                {"text": "Aku aku kata-kata liputan6"},
                {"text": "aku; Café Cafe\u0301"},
                {"url": "https://must-not-be-tokenized.example"},
            ]
            shard = corpus / "part-000.json.gz"
            with gzip.open(shard, "wt", encoding="utf-8", newline="\n") as stream:
                for record in records:
                    stream.write(json.dumps(record, ensure_ascii=False) + "\n")
                stream.write("{malformed}\n")

            entries = discover_shards(corpus)
            config = {
                "corpus_dir": corpus,
                "output_dir": output,
                "workers": 1,
                "expected_shards": 1,
                "checkpoint_every_lines": 1,
                "log_every_lines": 10_000,
            }
            manifest = {"shards": entries}
            run_workers(config, manifest)
            first = process_shard(config, entries[0], worker_id=0)
            second = process_shard(config, entries[0], worker_id=0)
            self.assertEqual(first["counts_sha256"], second["counts_sha256"])
            self.assertEqual(first["metrics"]["malformed_json_lines"], 1)
            self.assertEqual(first["metrics"]["missing_or_non_string_text"], 1)

            final_path = merge_checkpoints(config, manifest)
            first_final_bytes = final_path.read_bytes()
            self.assertEqual(merge_checkpoints(config, manifest), final_path)
            self.assertEqual(final_path.read_bytes(), first_final_bytes)
            rows = list(iter_count_csv(final_path))
            self.assertEqual(
                rows,
                [
                    ("aku", 2),
                    ("Aku", 1),
                    ("Cafe\u0301", 1),
                    ("Café", 1),
                    ("kata-kata", 1),
                    ("liputan6", 1),
                ],
            )
            self.assertNotIn("https", {token for token, _ in rows})


if __name__ == "__main__":
    unittest.main()
