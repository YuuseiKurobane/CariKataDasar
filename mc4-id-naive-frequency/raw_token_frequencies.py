"""Resumable raw surface-token counting for local mc4-id JSONL.GZ shards."""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import multiprocessing
import os
import sqlite3
import sys
import time
import traceback
from collections import Counter
from pathlib import Path
from typing import Any

from io_utils import (
    atomic_write_count_csv,
    atomic_write_json,
    iter_count_csv,
    read_json,
    sha256_file,
)
from tokenizer import iter_tokens, tokenizer_metadata

SCHEMA_VERSION = 1
DEFAULT_CONFIG = Path(__file__).with_name("config.json")


def load_config(path: Path) -> dict[str, Any]:
    config = read_json(path)
    required = {
        "corpus_dir",
        "output_dir",
        "workers",
        "expected_shards",
        "checkpoint_every_lines",
        "log_every_lines",
    }
    missing = sorted(required - set(config))
    if missing:
        raise ValueError(f"Missing config keys: {', '.join(missing)}")

    base = path.resolve().parent
    for key in ("corpus_dir", "output_dir"):
        value = Path(config[key]).expanduser()
        if not value.is_absolute():
            value = base / value
        config[key] = value.resolve()

    config["workers"] = int(config["workers"])
    config["expected_shards"] = int(config["expected_shards"])
    config["checkpoint_every_lines"] = int(config["checkpoint_every_lines"])
    config["log_every_lines"] = int(config["log_every_lines"])
    if config["workers"] < 1:
        raise ValueError("workers must be at least 1")
    if config["checkpoint_every_lines"] < 1:
        raise ValueError("checkpoint_every_lines must be at least 1")
    if config["log_every_lines"] < 1:
        raise ValueError("log_every_lines must be at least 1")
    return config


def discover_shards(corpus_dir: Path) -> list[dict[str, Any]]:
    paths = sorted(
        (path.resolve() for path in corpus_dir.rglob("*.json.gz")),
        key=lambda path: path.relative_to(corpus_dir).as_posix(),
    )
    entries: list[dict[str, Any]] = []
    for index, path in enumerate(paths):
        stat = path.stat()
        entries.append(
            {
                "id": f"shard-{index:04d}",
                "relative_path": path.relative_to(corpus_dir).as_posix(),
                "size": stat.st_size,
                "mtime_ns": stat.st_mtime_ns,
            }
        )
    return entries


def _stable_json_hash(value: Any) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _implementation_hash() -> str:
    digest = hashlib.sha256()
    for name in ("io_utils.py", "raw_token_frequencies.py", "tokenizer.py"):
        path = Path(__file__).with_name(name)
        digest.update(name.encode("utf-8"))
        digest.update(path.read_bytes())
    return digest.hexdigest()


def prepare_manifest(config: dict[str, Any]) -> dict[str, Any]:
    corpus_dir: Path = config["corpus_dir"]
    output_dir: Path = config["output_dir"]
    if not corpus_dir.is_dir():
        raise FileNotFoundError(f"Corpus directory does not exist: {corpus_dir}")

    shards = discover_shards(corpus_dir)
    expected = config["expected_shards"]
    if expected and len(shards) != expected:
        raise RuntimeError(
            f"Found {len(shards)} *.json.gz shards, expected {expected}. "
            "Refusing to create a partial raw table."
        )

    identity = {
        "schema_version": SCHEMA_VERSION,
        "corpus_dir": str(corpus_dir),
        "corpus_inventory_sha256": _stable_json_hash(shards),
        "implementation_sha256": _implementation_hash(),
        "tokenizer": tokenizer_metadata(),
        "shards": shards,
    }
    manifest_path = output_dir / "manifest.json"
    if manifest_path.exists():
        existing = read_json(manifest_path)
        for key in (
            "schema_version",
            "corpus_dir",
            "corpus_inventory_sha256",
            "implementation_sha256",
            "tokenizer",
            "shards",
        ):
            if existing.get(key) != identity[key]:
                raise RuntimeError(
                    f"Existing run manifest differs at {key!r}. Use a new "
                    "output_dir; raw runs are intentionally immutable."
                )
        return existing

    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        **identity,
        "created_unix_time": time.time(),
        "python": sys.version,
        "configuration": {
            "workers": config["workers"],
            "expected_shards": expected,
            "checkpoint_every_lines": config["checkpoint_every_lines"],
            "log_every_lines": config["log_every_lines"],
        },
        "status": "counting",
    }
    atomic_write_json(manifest_path, manifest)
    return manifest


def _source_path(config: dict[str, Any], entry: dict[str, Any]) -> Path:
    return config["corpus_dir"] / Path(entry["relative_path"])


def _state_path(output_dir: Path, shard_id: str) -> Path:
    return output_dir / "checkpoints" / f"{shard_id}.state.json"


def _complete_count_path(output_dir: Path, shard_id: str) -> Path:
    return output_dir / "checkpoints" / f"{shard_id}.counts.csv.gz"


def _source_matches(entry: dict[str, Any], source: Path) -> bool:
    stat = source.stat()
    return stat.st_size == entry["size"] and stat.st_mtime_ns == entry["mtime_ns"]


def _initial_metrics() -> dict[str, int]:
    return {
        "lines_seen": 0,
        "json_documents": 0,
        "documents_with_text": 0,
        "malformed_json_lines": 0,
        "non_object_json_lines": 0,
        "missing_or_non_string_text": 0,
        "utf8_replacement_lines": 0,
        "tokens_seen": 0,
    }


def _write_snapshot(
    output_dir: Path,
    entry: dict[str, Any],
    counts: Counter[str],
    metrics: dict[str, int],
    previous_snapshot: str | None,
) -> str:
    shard_id = entry["id"]
    name = f"{shard_id}.snapshot-{metrics['lines_seen']:012d}.csv.gz"
    path = output_dir / "checkpoints" / name
    atomic_write_count_csv(path, sorted(counts.items()))
    state = {
        "schema_version": SCHEMA_VERSION,
        "status": "in_progress",
        "source": entry,
        "metrics": metrics,
        "snapshot_file": name,
        "updated_unix_time": time.time(),
    }
    atomic_write_json(_state_path(output_dir, shard_id), state)

    # Once the state atomically points at the new snapshot, the older one is
    # no longer needed for recovery.
    if previous_snapshot and previous_snapshot != name:
        old = output_dir / "checkpoints" / previous_snapshot
        try:
            old.unlink()
        except FileNotFoundError:
            pass
    return name


def process_shard(
    config: dict[str, Any],
    entry: dict[str, Any],
    worker_id: int,
) -> dict[str, Any]:
    output_dir: Path = config["output_dir"]
    source = _source_path(config, entry)
    shard_id = entry["id"]
    state_path = _state_path(output_dir, shard_id)
    complete_path = _complete_count_path(output_dir, shard_id)

    if not _source_matches(entry, source):
        raise RuntimeError(f"Source shard changed since manifest: {source}")

    counts: Counter[str] = Counter()
    metrics = _initial_metrics()
    previous_snapshot: str | None = None

    if state_path.exists():
        state = read_json(state_path)
        if state.get("source") != entry:
            raise RuntimeError(f"Checkpoint source mismatch: {state_path}")
        if state.get("status") == "complete":
            if not complete_path.exists():
                raise RuntimeError(f"Missing completed count file: {complete_path}")
            if sha256_file(complete_path) != state.get("counts_sha256"):
                raise RuntimeError(f"Completed count checksum mismatch: {complete_path}")
            print(f"[worker {worker_id:02d}] skip complete {shard_id}", flush=True)
            return state
        if state.get("status") != "in_progress":
            raise RuntimeError(f"Unknown checkpoint status in {state_path}")
        previous_snapshot = state["snapshot_file"]
        snapshot_path = output_dir / "checkpoints" / previous_snapshot
        if not snapshot_path.exists():
            raise RuntimeError(f"Missing snapshot: {snapshot_path}")
        counts.update(dict(iter_count_csv(snapshot_path)))
        metrics = {key: int(value) for key, value in state["metrics"].items()}
        print(
            f"[worker {worker_id:02d}] resume {shard_id} after "
            f"{metrics['lines_seen']:,} lines",
            flush=True,
        )

    resume_after = metrics["lines_seen"]
    next_checkpoint = resume_after + config["checkpoint_every_lines"]
    next_log = resume_after + config["log_every_lines"]
    started = time.monotonic()

    with gzip.open(source, "rb") as stream:
        for line_number, raw_line in enumerate(stream, start=1):
            if line_number <= resume_after:
                continue
            metrics["lines_seen"] = line_number
            decoded = raw_line.decode("utf-8", errors="replace")
            if "\ufffd" in decoded:
                metrics["utf8_replacement_lines"] += 1
            if not decoded.strip():
                continue
            try:
                document = json.loads(decoded)
            except (json.JSONDecodeError, RecursionError):
                metrics["malformed_json_lines"] += 1
                continue

            metrics["json_documents"] += 1
            if not isinstance(document, dict):
                metrics["non_object_json_lines"] += 1
                continue
            text = document.get("text")
            if not isinstance(text, str):
                metrics["missing_or_non_string_text"] += 1
                continue

            metrics["documents_with_text"] += 1
            document_counts = Counter(iter_tokens(text))
            counts.update(document_counts)
            metrics["tokens_seen"] += sum(document_counts.values())

            if line_number >= next_log:
                elapsed = max(time.monotonic() - started, 0.001)
                processed = line_number - resume_after
                print(
                    f"[worker {worker_id:02d}] {shard_id}: "
                    f"{line_number:,} lines, {metrics['tokens_seen']:,} tokens, "
                    f"{processed / elapsed:,.0f} lines/s",
                    flush=True,
                )
                next_log = line_number + config["log_every_lines"]

            if line_number >= next_checkpoint:
                previous_snapshot = _write_snapshot(
                    output_dir,
                    entry,
                    counts,
                    metrics,
                    previous_snapshot,
                )
                next_checkpoint = line_number + config["checkpoint_every_lines"]

    atomic_write_count_csv(complete_path, sorted(counts.items()))
    complete_state = {
        "schema_version": SCHEMA_VERSION,
        "status": "complete",
        "source": entry,
        "metrics": metrics,
        "counts_file": complete_path.name,
        "counts_sha256": sha256_file(complete_path),
        "unique_tokens": len(counts),
        "completed_unix_time": time.time(),
    }
    atomic_write_json(state_path, complete_state)
    if previous_snapshot:
        try:
            (output_dir / "checkpoints" / previous_snapshot).unlink()
        except FileNotFoundError:
            pass
    print(
        f"[worker {worker_id:02d}] complete {shard_id}: "
        f"{metrics['tokens_seen']:,} tokens, {len(counts):,} unique",
        flush=True,
    )
    return complete_state


def _worker_main(
    config: dict[str, Any],
    entries: list[dict[str, Any]],
    worker_id: int,
) -> None:
    status_path = config["output_dir"] / "workers" / f"worker-{worker_id:02d}.json"
    try:
        for entry in entries:
            process_shard(config, entry, worker_id)
        atomic_write_json(
            status_path,
            {
                "status": "complete",
                "worker_id": worker_id,
                "shard_ids": [entry["id"] for entry in entries],
            },
        )
    except BaseException:
        atomic_write_json(
            status_path,
            {
                "status": "failed",
                "worker_id": worker_id,
                "traceback": traceback.format_exc(),
            },
        )
        raise


def run_workers(config: dict[str, Any], manifest: dict[str, Any]) -> None:
    entries = manifest["shards"]
    worker_count = min(config["workers"], len(entries))
    assignments = [entries[index::worker_count] for index in range(worker_count)]
    plan_dir = config["output_dir"] / "workers"
    plan_dir.mkdir(parents=True, exist_ok=True)
    for worker_id, assignment in enumerate(assignments):
        plan = "\n".join(entry["relative_path"] for entry in assignment) + "\n"
        plan_path = plan_dir / f"worker-{worker_id:02d}.files.txt"
        plan_path.write_text(plan, encoding="utf-8", newline="\n")

    context = multiprocessing.get_context("spawn")
    processes = [
        context.Process(
            target=_worker_main,
            args=(config, assignment, worker_id),
            name=f"raw-token-worker-{worker_id:02d}",
        )
        for worker_id, assignment in enumerate(assignments)
    ]
    for process in processes:
        process.start()
    for process in processes:
        process.join()
    failures = [process for process in processes if process.exitcode != 0]
    if failures:
        names = ", ".join(
            f"{process.name} (exit {process.exitcode})" for process in failures
        )
        raise RuntimeError(f"One or more workers failed: {names}")


def _connect_merge_database(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA synchronous=NORMAL")
    connection.execute("PRAGMA temp_store=FILE")
    connection.execute(
        "CREATE TABLE IF NOT EXISTS counts ("
        "token TEXT PRIMARY KEY COLLATE BINARY, "
        "occurrences INTEGER NOT NULL CHECK (occurrences >= 0)"
        ") WITHOUT ROWID"
    )
    connection.execute(
        "CREATE TABLE IF NOT EXISTS merged_shards ("
        "shard_id TEXT PRIMARY KEY, "
        "counts_sha256 TEXT NOT NULL"
        ") WITHOUT ROWID"
    )
    return connection


def merge_checkpoints(
    config: dict[str, Any],
    manifest: dict[str, Any],
) -> Path:
    output_dir: Path = config["output_dir"]
    database_path = output_dir / "merge" / "counts.sqlite3"
    connection = _connect_merge_database(database_path)
    aggregate_metrics = _initial_metrics()
    try:
        for entry in manifest["shards"]:
            shard_id = entry["id"]
            state_path = _state_path(output_dir, shard_id)
            if not state_path.exists():
                raise RuntimeError(f"Shard has no checkpoint state: {shard_id}")
            state = read_json(state_path)
            if state.get("status") != "complete":
                raise RuntimeError(f"Shard is not complete: {shard_id}")
            for key in aggregate_metrics:
                aggregate_metrics[key] += int(state["metrics"][key])
            count_path = _complete_count_path(output_dir, shard_id)
            expected_hash = state["counts_sha256"]
            if sha256_file(count_path) != expected_hash:
                raise RuntimeError(f"Count checksum mismatch: {count_path}")

            prior = connection.execute(
                "SELECT counts_sha256 FROM merged_shards WHERE shard_id = ?",
                (shard_id,),
            ).fetchone()
            if prior:
                if prior[0] != expected_hash:
                    raise RuntimeError(
                        f"{shard_id} changed after it was merged; use a new "
                        "output_dir"
                    )
                print(f"[merge] skip {shard_id}", flush=True)
                continue

            print(f"[merge] add {shard_id}", flush=True)
            with connection:
                batch: list[tuple[str, int]] = []
                for token, occurrences in iter_count_csv(count_path):
                    batch.append((token, occurrences))
                    if len(batch) >= 10_000:
                        connection.executemany(
                            "INSERT INTO counts(token, occurrences) VALUES (?, ?) "
                            "ON CONFLICT(token) DO UPDATE SET occurrences = "
                            "occurrences + excluded.occurrences",
                            batch,
                        )
                        batch.clear()
                if batch:
                    connection.executemany(
                        "INSERT INTO counts(token, occurrences) VALUES (?, ?) "
                        "ON CONFLICT(token) DO UPDATE SET occurrences = "
                        "occurrences + excluded.occurrences",
                        batch,
                    )
                connection.execute(
                    "INSERT INTO merged_shards(shard_id, counts_sha256) "
                    "VALUES (?, ?)",
                    (shard_id, expected_hash),
                )

        final_path = output_dir / "token_frequencies.csv.gz"
        cursor = connection.execute(
            "SELECT token, occurrences FROM counts "
            "ORDER BY occurrences DESC, token COLLATE BINARY ASC"
        )
        atomic_write_count_csv(final_path, cursor)
        total_unique, total_occurrences = connection.execute(
            "SELECT COUNT(*), COALESCE(SUM(occurrences), 0) FROM counts"
        ).fetchone()
    finally:
        connection.close()

    completed_manifest = dict(manifest)
    completed_manifest.update(
        {
            "status": "complete",
            "completed_unix_time": time.time(),
            "output": {
                "path": final_path.name,
                "sha256": sha256_file(final_path),
                "unique_tokens": total_unique,
                "total_occurrences": total_occurrences,
                "sort": "occurrences descending, then token ascending",
                "header": ["token", "occurrences"],
            },
            "aggregate_metrics": aggregate_metrics,
        }
    )
    atomic_write_json(output_dir / "manifest.json", completed_manifest)
    print(
        f"[done] {total_occurrences:,} occurrences, "
        f"{total_unique:,} unique tokens -> {final_path}",
        flush=True,
    )
    return final_path


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=("count", "merge"),
        nargs="?",
        default="count",
        help="'count' processes shards then merges; 'merge' only resumes merge",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG,
        help=f"JSON configuration (default: {DEFAULT_CONFIG.name})",
    )
    parser.add_argument(
        "--workers",
        type=int,
        help="Override the configured worker count for this invocation",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    config = load_config(args.config)
    if args.workers is not None:
        if args.workers < 1:
            raise ValueError("--workers must be at least 1")
        config["workers"] = args.workers
    manifest = prepare_manifest(config)
    if args.command == "count":
        run_workers(config, manifest)
    merge_checkpoints(config, manifest)
    return 0


if __name__ == "__main__":
    multiprocessing.freeze_support()
    raise SystemExit(main())
