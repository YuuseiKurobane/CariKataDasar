from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tokenizer import iter_tokens


class TokenizerTests(unittest.TestCase):
    def test_preserves_case_and_digits(self) -> None:
        self.assertEqual(
            list(iter_tokens("nenekku Nenekku NENEKKU liputan6 123")),
            ["nenekku", "Nenekku", "NENEKKU", "liputan6", "123"],
        )

    def test_internal_hyphens_and_apostrophes(self) -> None:
        self.assertEqual(
            list(iter_tokens("-kata kata- kata-kata l'amour O\u2019Brien")),
            ["kata", "kata", "kata-kata", "l'amour", "O\u2019Brien"],
        )

    def test_dashes_are_boundaries_except_unicode_hyphens(self) -> None:
        self.assertEqual(
            list(iter_tokens("a\u2010b c\u2011d e\u2013f g\u2014h")),
            ["a\u2010b", "c\u2011d", "e", "f", "g", "h"],
        )

    def test_punctuation_underscore_and_web_text(self) -> None:
        self.assertEqual(
            list(iter_tokens("foo_bar@example.com https://x.id/a?q=2")),
            ["foo", "bar", "example", "com", "https", "x", "id", "a", "q", "2"],
        )

    def test_unicode_letters_numbers_and_combining_marks(self) -> None:
        decomposed = "Cafe\u0301"
        self.assertEqual(
            list(iter_tokens(f"{decomposed} Café العربية １２")),
            [decomposed, "Café", "العربية", "１２"],
        )

    def test_no_unicode_normalization(self) -> None:
        composed = "é"
        decomposed = "e\u0301"
        self.assertNotEqual(composed, decomposed)
        self.assertEqual(list(iter_tokens(f"{composed} {decomposed}")), [composed, decomposed])


if __name__ == "__main__":
    unittest.main()
