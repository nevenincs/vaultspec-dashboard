---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S22'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace user-state-persistence with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S22 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The register the session route prefixes in the SPA gate and ## Scope

- `engine/crates/vaultspec-api/src/routes/spa.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# register the session route prefixes in the SPA gate

## Scope

- `engine/crates/vaultspec-api/src/routes/spa.rs`

## Description

- Added `/session` and `/settings` to `API_PREFIXES` in `spa.rs`.
- That one list is both the bearer boundary (so the new routes are token-gated) and the SPA-fallback exclusion (so an unknown path under these prefixes returns a JSON 404 carrying the tiers block instead of being swallowed by the `index.html` fallback).

## Outcome

The session and settings routes are now bearer-gated and excluded from the SPA fallback. `cargo build -p vaultspec-api` is clean.

## Notes

- `API_PREFIXES` is shared by both `bearer_gate` (in `app.rs`) and `spa_fallback`, so this single edit gates the routes and protects them from the fallback at once.
