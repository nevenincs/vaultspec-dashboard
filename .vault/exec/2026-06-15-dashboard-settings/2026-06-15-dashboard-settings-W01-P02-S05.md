---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S05'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-settings with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S05 and 2026-06-15-dashboard-settings-plan placeholders are machine-filled by
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
     The Implement effective-value resolution with scoped-then-global precedence, default fallback, and per-key provenance and ## Scope

- `engine/crates/vaultspec-session/src/settings.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Implement effective-value resolution with scoped-then-global precedence, default fallback, and per-key provenance

## Scope

- `engine/crates/vaultspec-session/src/settings.rs`

## Description

- Established effective-value resolution semantics: scoped-then-global with a schema-default fallback and per-key provenance.
- Resolution lives client-side (stores selector) consistent with the existing no-implicit-fallback store model; the engine returns the canonical value.

## Outcome

Precedence + provenance defined once and consumed by the stores selector.

## Notes

