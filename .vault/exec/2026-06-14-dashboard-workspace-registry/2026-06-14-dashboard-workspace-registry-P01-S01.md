---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S01'
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
     The S01 and 2026-06-14-dashboard-workspace-registry-plan placeholders are machine-filled by
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
     The Define the WorkspaceRoot record and registry schema (stable id from git common dir, label, path, reachability) and ## Scope

- `engine/crates/vaultspec-session/src/schema.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Define the WorkspaceRoot record and registry schema (stable id from git common dir, label, path, reachability)

## Scope

- `engine/crates/vaultspec-session/src/schema.rs`

## Description

- Add the `WorkspaceRoot` record to the session crate schema module: stable id (the canonical git common dir), operator label, absolute root path, launch-default marker, reachability boolean, and an optional unreachable reason, all serde-derived.
- Add the `workspace_registry` table DDL (id primary key, label, path, is_launch, position, reachable, unreachable_reason, updated_at) plus a position index, to the migration-free schema-init batch.
- Add the `ACTIVE_WORKSPACE_KEY` constant the active-workspace pointer rides on the existing global-settings kv surface.
- Extend the schema idempotency test to assert the new table exists.

## Outcome

The registry record type and durable table shape are defined and compile cleanly; `ensure_schema` creates the table idempotently on every open. The record is a pure config aggregate carrying no git dependency, keeping the session crate inside the read-and-infer fence.

## Notes

The stable id is derived by the caller (the API boot path) from a discovered git common dir and passed in, so the session crate stays git-free. The active-workspace selection reuses the global-settings kv table rather than a new table — a single pointer needs no dedicated schema.
