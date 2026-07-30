---
type: Workflow
status: stable
stale_after: 2027-01-01
---

# ASD-STE100 Rules & Validation

easyCV integrates a custom verification engine to enforce compliance with the **Aerospace, Security and Defence Industries Association of Europe (ASD) Simplified Technical English (STE-100 Issue 9)** writing specification.

## Validation Scope

Every resume **Professional Summary** and **Work Experience Bullet Point** is processed through the rule engine during the quality validation step:

- **Sentence Limits**: Recommends keeping procedural bullets under 20 words and descriptive sentences under 25 words (Rules 5.1 & 6.3).
- **Contraction Suppression**: Identifies and flags common contraction forms (e.g. `don't`, `can't`, `shouldn't`) to ensure text is fully expanded (Rule 4.2).
- **British English Spelling**: Checks spelling against a dictionary to suggest American replacements (e.g. `colour` -> `color`, `fibre` -> `fiber`) (Rule 1.14).
- **Active Voice**: Flags passive constructions (e.g. auxiliary `to be` + past participle, agent markers `by <agent>`) (Rule 3.6).
- **Approved Suffixes**: Minimizes verb complexity by flagging non-approved `-ing` suffixes (Rule 3.5).
- **Semicolons**: Recommends breaking clauses joined by semicolons into discrete sentences (Rule 8.1).

## Implementation Reference

- Rules Engine: Core check is implemented in `ste100.py`.
- Integration: Triggered inside the validation pass of `pipeline.py` when calling `score_structured_data()`.
