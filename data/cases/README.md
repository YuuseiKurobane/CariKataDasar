# Regression cases

Community reports and manually confirmed difficult cases belong here as
JSON Lines. Recommended fields:

```json
{"token":"example","expected_any":["headword"],"expected_first":"headword","source":"issue-or-url","notes":""}
```

Coverage and ordering assertions should be separate: a case can require that
a real headword appears without asserting that no extra candidates exist.

`community.jsonl` contains the active community-derived coverage suite. The
Node test suite loads it directly, so adding a case immediately creates a
regression test.
