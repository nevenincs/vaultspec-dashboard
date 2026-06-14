---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S07'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-workspace-registry with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S07 and 2026-06-14-dashboard-workspace-registry-plan placeholders are machine-filled by
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
     The Add the optional workspace= parameter to /map defaulting to the active workspace with unchanged single-workspace behaviour and ## Scope

- `engine/crates/vaultspec-api/src/routes/registry.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the optional workspace= parameter to /map defaulting to the active workspace with unchanged single-workspace behaviour

## Scope

- `engine/crates/vaultspec-api/src/routes/registry.rs`

## Description

- Add the optional `workspace=` query parameter to the `/map` handler, resolving the launch root read-only through a registry helper: absent or `active` selects the active workspace (falling back to the launch workspace when no selection exists), a registered id selects that root, and an unknown id 400s honestly with the tiers block.
- Keep the `/map` handler in `query.rs` with its existing tests; the workspace-resolution helper lives in `routes/registry.rs` per the plan's file intent.

## Outcome

The single-workspace behaviour is the unchanged `workspace=active` default — the existing `/map` tests pass unmodified — and `/map?workspace=<id>` lists a chosen registered root. A route test asserts the unchanged default plus the unknown-workspace 400 carrying the tiers block.

## Notes

The default falls back to the launch workspace rather than 400 on a torn registry, so `/map` never regresses to an error when no active workspace has been selected yet.
