from __future__ import annotations

import csv
import gzip
import heapq
import io
import os
import re
import tempfile
from pathlib import Path
from typing import Iterable, Iterator

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
RAW_FREQUENCY_PATH = (
    REPOSITORY_ROOT
    / "mc4-id-naive-frequency"
    / "run-v1"
    / "token_frequencies.csv.gz"
)
CLEANED_FREQUENCY_PATH = (
    REPOSITORY_ROOT / "data" / "frequency" / "cleaned_token_frequencies.csv.gz"
)
REVIEW_ROOT = REPOSITORY_ROOT / "data" / "review"
REVIEW_SEED_PATH = REVIEW_ROOT / "corpus-review-seed.csv"
REVIEW_BATCH_DIRECTORY = REVIEW_ROOT / "batches"
REVIEW_LABELED_DIRECTORY = REVIEW_ROOT / "labeled"

MINIMUM_OCCURRENCES = 100
MEDIUM_MINIMUM_TOKEN_LENGTH = 8
LONG_MINIMUM_TOKEN_LENGTH = 13
SEED_ROWS_PER_GROUP = 100
BATCH_SIZE = 10_000
MAX_BATCH_COUNT = 10
MAX_CHUNK_KEYS = 500_000

ASCII_LOWERCASE_RE = re.compile(r"[a-z]")


def open_text_auto(path: Path):
    if path.suffix.lower() == ".gz":
        return gzip.open(path, "rt", encoding="utf-8", newline="")
    return path.open("r", encoding="utf-8", newline="")


def iter_frequency_rows(path: Path) -> Iterator[tuple[str, int]]:
    with open_text_auto(path) as stream:
        reader = csv.reader(stream)
        try:
            header = next(reader)
        except StopIteration as error:
            raise ValueError(f"Empty frequency file: {path}") from error
        if header != ["token", "occurrences"]:
            raise ValueError(
                f"{path} has header {header!r}; expected ['token', 'occurrences']"
            )

        for line_number, row in enumerate(reader, start=2):
            if len(row) != 2:
                raise ValueError(f"{path}:{line_number}: expected 2 columns")
            try:
                occurrences = int(row[1])
            except ValueError as error:
                raise ValueError(
                    f"{path}:{line_number}: invalid occurrence count {row[1]!r}"
                ) from error
            if occurrences < 0:
                raise ValueError(f"{path}:{line_number}: negative count")
            yield row[0], occurrences


def _deterministic_gzip_text_writer(path: Path) -> tuple[io.TextIOWrapper, io.BufferedWriter]:
    binary = path.open("wb")
    compressed = gzip.GzipFile(
        filename="",
        mode="wb",
        fileobj=binary,
        compresslevel=6,
        mtime=0,
    )
    text = io.TextIOWrapper(compressed, encoding="utf-8", newline="")
    return text, binary


def atomic_write_csv(
    path: Path,
    header: Iterable[str],
    rows: Iterable[Iterable[object]],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + f".tmp-{os.getpid()}")

    if path.suffix.lower() == ".gz":
        stream, binary = _deterministic_gzip_text_writer(temporary)
        try:
            writer = csv.writer(stream, lineterminator="\n")
            writer.writerow(list(header))
            writer.writerows(rows)
            stream.flush()
            stream.close()
            binary.flush()
            os.fsync(binary.fileno())
        finally:
            if not stream.closed:
                stream.close()
            if not binary.closed:
                binary.close()
    else:
        with temporary.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.writer(stream, lineterminator="\n")
            writer.writerow(list(header))
            writer.writerows(rows)
            stream.flush()
            os.fsync(stream.fileno())

    os.replace(temporary, path)


def flush_chunk(
    chunk_paths: list[Path],
    chunk_directory: Path,
    chunk_index: int,
    counts: dict[str, int],
) -> int:
    if not counts:
        return chunk_index

    chunk_path = chunk_directory / f"chunk-{chunk_index:04d}.csv"
    atomic_write_csv(
        chunk_path,
        ("token", "occurrences"),
        ((token, occurrences) for token, occurrences in sorted(counts.items())),
    )
    chunk_paths.append(chunk_path)
    counts.clear()
    return chunk_index + 1


def merge_chunk_rows(chunk_paths: list[Path]) -> Iterator[tuple[str, int]]:
    merged = heapq.merge(*(iter_frequency_rows(path) for path in chunk_paths))
    current_token: str | None = None
    current_occurrences = 0

    for token, occurrences in merged:
        if token != current_token:
            if current_token is not None:
                yield current_token, current_occurrences
            current_token = token
            current_occurrences = occurrences
        else:
            current_occurrences += occurrences

    if current_token is not None:
        yield current_token, current_occurrences


def build_cleaned_rows(raw_path: Path) -> list[tuple[str, int]]:
    with tempfile.TemporaryDirectory(prefix="prepare-debug-frequencies-") as temporary:
        chunk_directory = Path(temporary)
        chunk_paths: list[Path] = []
        chunk_counts: dict[str, int] = {}
        chunk_index = 0

        for token, occurrences in iter_frequency_rows(raw_path):
            lowercased = token.lower()
            if not ASCII_LOWERCASE_RE.search(lowercased):
                continue
            chunk_counts[lowercased] = chunk_counts.get(lowercased, 0) + occurrences
            if len(chunk_counts) >= MAX_CHUNK_KEYS:
                chunk_index = flush_chunk(
                    chunk_paths,
                    chunk_directory,
                    chunk_index,
                    chunk_counts,
                )

        flush_chunk(chunk_paths, chunk_directory, chunk_index, chunk_counts)

        cleaned_rows = [
            (token, occurrences)
            for token, occurrences in merge_chunk_rows(chunk_paths)
            if occurrences > MINIMUM_OCCURRENCES
        ]

    cleaned_rows.sort(key=lambda row: (-row[1], row[0]))
    return cleaned_rows


def build_seed_rows(cleaned_rows: list[tuple[str, int]]) -> list[tuple[str, int, str, str]]:
    top_rows = cleaned_rows[:SEED_ROWS_PER_GROUP]
    medium_rows = [
        row
        for row in cleaned_rows
        if len(row[0]) >= MEDIUM_MINIMUM_TOKEN_LENGTH
    ][:SEED_ROWS_PER_GROUP]
    long_rows = [
        row
        for row in cleaned_rows
        if len(row[0]) >= LONG_MINIMUM_TOKEN_LENGTH
    ][:SEED_ROWS_PER_GROUP]

    if (
        len(top_rows) < SEED_ROWS_PER_GROUP
        or len(medium_rows) < SEED_ROWS_PER_GROUP
        or len(long_rows) < SEED_ROWS_PER_GROUP
    ):
        raise ValueError("Not enough cleaned rows to build the 300-row review seed")

    return [
        (token, occurrences, "", "")
        for token, occurrences in [*top_rows, *medium_rows, *long_rows]
    ]


def write_review_outputs(cleaned_rows: list[tuple[str, int]]) -> None:
    REVIEW_ROOT.mkdir(parents=True, exist_ok=True)
    REVIEW_BATCH_DIRECTORY.mkdir(parents=True, exist_ok=True)
    REVIEW_LABELED_DIRECTORY.mkdir(parents=True, exist_ok=True)

    atomic_write_csv(
        REVIEW_SEED_PATH,
        ("token", "occurrences", "expected_result", "is_interesting"),
        build_seed_rows(cleaned_rows),
    )

    for existing_path in REVIEW_BATCH_DIRECTORY.glob("corpus-review-*.csv"):
        existing_path.unlink()

    for batch_index in range(MAX_BATCH_COUNT):
        start = batch_index * BATCH_SIZE
        if start >= len(cleaned_rows):
            break

        end = min(start + BATCH_SIZE, len(cleaned_rows))
        file_name = (
            f"corpus-review-{start // 1000}-{(start + BATCH_SIZE) // 1000}k.csv"
        )
        batch_rows = [
            (token, occurrences, "", "")
            for token, occurrences in cleaned_rows[start:end]
        ]
        atomic_write_csv(
            REVIEW_BATCH_DIRECTORY / file_name,
            ("token", "occurrences", "expected_result", "is_interesting"),
            batch_rows,
        )


def main() -> int:
    cleaned_rows = build_cleaned_rows(RAW_FREQUENCY_PATH)

    atomic_write_csv(
        CLEANED_FREQUENCY_PATH,
        ("token", "occurrences"),
        cleaned_rows,
    )
    write_review_outputs(cleaned_rows)

    generated_batch_count = min(
        MAX_BATCH_COUNT,
        (len(cleaned_rows) + BATCH_SIZE - 1) // BATCH_SIZE,
    )
    print(
        "Prepared "
        f"{len(cleaned_rows):,} cleaned tokens from "
        f"{RAW_FREQUENCY_PATH.relative_to(REPOSITORY_ROOT)}; wrote "
        f"{CLEANED_FREQUENCY_PATH.relative_to(REPOSITORY_ROOT)}, "
        f"{REVIEW_SEED_PATH.relative_to(REPOSITORY_ROOT)}, and "
        f"{generated_batch_count} review batch file(s)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
