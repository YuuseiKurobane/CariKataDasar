"""Small deterministic and atomic I/O helpers."""

from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
import os
from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import Any


def atomic_write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + f".tmp-{os.getpid()}")
    with temporary.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2, sort_keys=True)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as stream:
        return json.load(stream)


def _deterministic_gzip_text_writer(path: Path) -> tuple[io.TextIOWrapper, Any]:
    """Open *path* for deterministic gzip text output.

    The caller must close the returned text stream. The second return value is
    the underlying binary file, retained so callers can fsync it.
    """
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


def atomic_write_count_csv(
    path: Path,
    rows: Iterable[tuple[str, int]],
) -> None:
    """Write token,occurrences as deterministic UTF-8 CSV or CSV.GZ."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + f".tmp-{os.getpid()}")

    if path.suffix.lower() == ".gz":
        stream, binary = _deterministic_gzip_text_writer(temporary)
        try:
            writer = csv.writer(stream, lineterminator="\n")
            writer.writerow(("token", "occurrences"))
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
            writer.writerow(("token", "occurrences"))
            writer.writerows(rows)
            stream.flush()
            os.fsync(stream.fileno())

    os.replace(temporary, path)


def open_text_auto(path: Path):
    if path.suffix.lower() == ".gz":
        return gzip.open(path, "rt", encoding="utf-8", newline="")
    return path.open("r", encoding="utf-8", newline="")


def iter_count_csv(path: Path) -> Iterator[tuple[str, int]]:
    with open_text_auto(path) as stream:
        reader = csv.reader(stream)
        try:
            header = next(reader)
        except StopIteration as error:
            raise ValueError(f"Empty count file: {path}") from error
        if header != ["token", "occurrences"]:
            raise ValueError(
                f"{path} has header {header!r}; expected "
                "['token', 'occurrences']"
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


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()
