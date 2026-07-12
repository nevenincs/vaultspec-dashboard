---
tags:
  - '#exec'
  - '#on-demand-cold-start'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S05'
related:
  - "[[2026-07-12-on-demand-cold-start-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace on-demand-cold-start with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S05 and 2026-07-12-on-demand-cold-start-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Run the full gate, live-verify cold-start payloads and first paint, review the diff, commit and ## Scope

- `frontend (full gate) + live verify` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Run the full gate, live-verify cold-start payloads and first paint, review the diff, commit

## Scope

- `frontend (full gate) + live verify`

## Description

Run the gate and verify live: just dev lint frontend exit 0; full vitest 311 files / 2844 tests green; Playwright cold-start census re-run on the rebuilt dev stack; adversarial review of the diff.

## Outcome

Verdict approve-with-nits, zero CRITICAL/HIGH (one MEDIUM tautological test assertion, fixed). Live census: desktop cold start now paints constellation (~119KB) + tree first page (84KB) with document slice (2.3MB) and tree remainder (656KB) arriving as background enrichment; compact still issues zero graph queries. Reviewer's optional note recorded: a tiers-less transport error during the fill shows the constellation instead of the unavailable card - accepted as the graceful intended outcome (shared origin makes it near-unreachable).

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
