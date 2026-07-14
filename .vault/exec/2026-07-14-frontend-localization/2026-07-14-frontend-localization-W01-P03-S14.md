---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S14'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace frontend-localization with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S14 and 2026-07-14-frontend-localization-plan placeholders are machine-filled by
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
     The Implement the bounded production-source localization scanner with narrow semantic exclusions and ## Scope

- `frontend/scripts/scan-localization.mjs`
- `frontend/scripts/localization-allowlist.json` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Implement the bounded production-source localization scanner with narrow semantic exclusions

## Scope

- `frontend/scripts/scan-localization.mjs`
- `frontend/scripts/localization-allowlist.json`

## Description

- Parse production TypeScript and TSX with the installed compiler API without executing
  application modules.
- Detect static presentation copy, unsafe translation construction, and direct locale
  formatting through bounded syntax and constant resolution.
- Exclude only tests, declarations, generated sources, catalog owners, and the exact
  alternate-locale resource fixture.
- Seed an exact per-occurrence allowlist that rejects new and stale findings.
- Bound traversal, file sizes, constant resolution, findings, snippets, and allowlist
  input.
- Resolve translation calls through imported symbol provenance and aliased hook
  destructuring without trusting same-name local functions.
- Reject mixed translated and literal branches, generated-comment bypasses, allowlist
  metadata changes, and constant-expansion overflow.

## Outcome

The source scanner deterministically inventories 1,560 current findings while refusing
new findings and stale allowlist entries. The stored baseline contains only stable IDs,
rule codes, and relative paths. It contains no source literals or diagnostic data.

## Notes

Temporary real source fixtures exercised every finding code and were removed. Standard
lint-gate integration remains assigned to S15, and durable fixture coverage remains
assigned to S16.
Adversarial temporary sources exercised aliased bindings, unrelated same-name calls,
mixed branches, generated comments, metadata tampering, and the parts cap, then were
removed.
