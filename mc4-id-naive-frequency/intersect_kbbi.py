"""Intersect an exact raw token table with clean KBBI term banks."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from io_utils import atomic_write_count_csv, iter_count_csv

TERM_BANK_RE = re.compile(r"^term_bank_(\d+)\.json$")
EXPECTED_CLEAN_HEADWORDS = 112_647


def clean_term_banks(dictionary_dir: Path) -> list[Path]:
    numbered: list[tuple[int, Path]] = []
    for path in dictionary_dir.glob("term_bank_*.json"):
        match = TERM_BANK_RE.match(path.name)
        if match:
            number = int(match.group(1))
            if number < 100:
                numbered.append((number, path))
    return [path for _, path in sorted(numbered)]


def load_clean_headwords(dictionary_dir: Path) -> set[str]:
    banks = clean_term_banks(dictionary_dir)
    if not banks:
        raise FileNotFoundError(
            f"No clean term_bank_1.json ... term_bank_99.json in {dictionary_dir}"
        )
    headwords: set[str] = set()
    for bank in banks:
        with bank.open("r", encoding="utf-8") as stream:
            entries: Any = json.load(stream)
        if not isinstance(entries, list):
            raise ValueError(f"{bank} is not a JSON array")
        for index, entry in enumerate(entries):
            if not isinstance(entry, list) or not entry or not isinstance(entry[0], str):
                raise ValueError(f"{bank}: invalid term entry at index {index}")
            headwords.add(entry[0])
    return headwords


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tokens", type=Path, help="token_frequencies.csv[.gz]")
    parser.add_argument(
        "--dictionary-dir",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "tools" / "corpus" / "4plus",
        help="Unpacked Yomitan dictionary directory",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("kbbi_exact_token_frequencies.csv.gz"),
    )
    parser.add_argument(
        "--allow-headword-count",
        action="store_true",
        help="Proceed if the clean KBBI set is not exactly 112,647 headwords",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    headwords = load_clean_headwords(args.dictionary_dir)
    if len(headwords) != EXPECTED_CLEAN_HEADWORDS and not args.allow_headword_count:
        raise RuntimeError(
            f"Loaded {len(headwords):,} unique clean headwords, expected "
            f"{EXPECTED_CLEAN_HEADWORDS:,}. Pass --allow-headword-count only "
            "after checking the dictionary."
        )

    matched_rows = (
        (token, occurrences)
        for token, occurrences in iter_count_csv(args.tokens)
        if token in headwords
    )
    atomic_write_count_csv(args.output, matched_rows)
    print(
        f"Loaded {len(headwords):,} clean headwords; wrote exact, "
        f"case-sensitive matches to {args.output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
