---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S02'
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
     The S02 and 2026-06-14-dashboard-workspace-registry-plan placeholders are machine-filled by
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
     The Implement the durable workspace-registry table with best-effort open-or-heal in the user-state store and ## Scope

- `engine/crates/vaultspec-session/src/store.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Implement the durable workspace-registry table with best-effort open-or-heal in the user-state store

## Scope

- `engine/crates/vaultspec-session/src/store.rs`

## Description

- Confirm the registry table participates in the existing best-effort open-or-heal: `open_or_heal` wipes the file and its WAL/SHM siblings on any open or schema failure, and `ensure_schema` recreates the registry table on the fresh file.
- Add a store-level test that overwrites the db with garbage, heals, and asserts the recreated `workspace_registry` table is queryable and empty.

## Outcome

A corrupt or shape-mismatched store recreates an empty, usable registry table alongside the session and settings tables, matching the prototype best-effort posture: there is nothing precious to safeguard, so a corrupt registry resets to no roots and the launch workspace is re-auto-registered on the next boot.

## Notes

No new heal mechanism was needed; the registry table rides the existing single open-or-heal path that already wipes-on-any-failure, so adding the table to the DDL was sufficient for full heal coverage.
