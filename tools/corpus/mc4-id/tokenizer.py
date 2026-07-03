"""The one and only token-boundary policy for the raw mc4-id count.

This module intentionally performs no normalization.  Every yielded token is
an exact slice of the input string.
"""

from __future__ import annotations

import re
import sys
import unicodedata
from collections.abc import Iterator

TOKENIZER_NAME = "unicode-alnum-internal-joiners"
TOKENIZER_VERSION = "1"

# Joiners are retained only between two alphanumeric runs. En/em dashes are
# punctuation, not word joiners.
JOINERS = "'\u02bc\u2010\u2011\u2019-"


def _unicode_mark_ranges() -> str:
    """Return a regex character-class body for this Python's Unicode marks."""
    ranges: list[tuple[int, int]] = []
    start: int | None = None
    previous: int | None = None

    for codepoint in range(sys.maxunicode + 1):
        is_mark = unicodedata.category(chr(codepoint)).startswith("M")
        if is_mark and start is None:
            start = previous = codepoint
        elif is_mark:
            previous = codepoint
        elif start is not None and previous is not None:
            ranges.append((start, previous))
            start = previous = None

    if start is not None and previous is not None:
        ranges.append((start, previous))

    def escaped(codepoint: int) -> str:
        if codepoint <= 0xFFFF:
            return rf"\u{codepoint:04x}"
        return rf"\U{codepoint:08x}"

    return "".join(
        escaped(first)
        if first == last
        else f"{escaped(first)}-{escaped(last)}"
        for first, last in ranges
    )


_MARK_CLASS = f"[{_unicode_mark_ranges()}]"
_ALNUM = r"[^\W_]"
_CONTINUATION = rf"(?:{_ALNUM}|{_MARK_CLASS})"
_JOINER_CLASS = f"[{re.escape(JOINERS)}]"

# A token starts with a Unicode alphanumeric character. Combining marks may
# follow an alphanumeric character. A listed joiner is internal only when it
# is followed by another alphanumeric run.
TOKEN_RE = re.compile(
    rf"{_ALNUM}{_CONTINUATION}*(?:{_JOINER_CLASS}{_ALNUM}{_CONTINUATION}*)*",
    flags=re.UNICODE,
)


def iter_tokens(text: str) -> Iterator[str]:
    """Yield exact, non-overlapping token slices from *text*."""
    for match in TOKEN_RE.finditer(text):
        yield match.group(0)


def tokenizer_metadata() -> dict[str, str | list[str]]:
    """Return the tokenizer identity recorded in run manifests."""
    return {
        "name": TOKENIZER_NAME,
        "version": TOKENIZER_VERSION,
        "unicode_database_version": unicodedata.unidata_version,
        "joiners": list(JOINERS),
        "normalization": "none",
        "case_folding": "none",
    }
