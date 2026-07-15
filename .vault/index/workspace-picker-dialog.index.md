---
generated: true
tags:
  - '#index'
  - '#workspace-picker-dialog'
date: '2026-07-15'
modified: '2026-07-15'
related:
  - '[[2026-07-14-workspace-picker-dialog-adr]]'
  - '[[2026-07-14-workspace-picker-dialog-research]]'
  - '[[2026-07-15-workspace-picker-dialog-P01-S01]]'
  - '[[2026-07-15-workspace-picker-dialog-P01-summary]]'
  - '[[2026-07-15-workspace-picker-dialog-P02-S02]]'
  - '[[2026-07-15-workspace-picker-dialog-P02-S03]]'
  - '[[2026-07-15-workspace-picker-dialog-P02-S04]]'
  - '[[2026-07-15-workspace-picker-dialog-P02-S05]]'
  - '[[2026-07-15-workspace-picker-dialog-P02-summary]]'
  - '[[2026-07-15-workspace-picker-dialog-P03-S06]]'
  - '[[2026-07-15-workspace-picker-dialog-P03-S07]]'
  - '[[2026-07-15-workspace-picker-dialog-P03-S08]]'
  - '[[2026-07-15-workspace-picker-dialog-P03-S09]]'
  - '[[2026-07-15-workspace-picker-dialog-P03-S10]]'
  - '[[2026-07-15-workspace-picker-dialog-P03-summary]]'
  - '[[2026-07-15-workspace-picker-dialog-P04-S11]]'
  - '[[2026-07-15-workspace-picker-dialog-P04-S12]]'
  - '[[2026-07-15-workspace-picker-dialog-P04-summary]]'
  - '[[2026-07-15-workspace-picker-dialog-audit]]'
  - '[[2026-07-15-workspace-picker-dialog-plan]]'
---

# `workspace-picker-dialog` feature index

Auto-generated index of all documents tagged with `#workspace-picker-dialog`.

## Documents

### adr

- `2026-07-14-workspace-picker-dialog-adr` - `workspace-picker-dialog` adr: `production add-project folder picker` | (**status:** `accepted`)

### audit

- `2026-07-15-workspace-picker-dialog-audit` - `workspace-picker-dialog` audit: `production folder picker review` | APPROVED

### exec

- `2026-07-15-workspace-picker-dialog-P01-S01` - Author the picker dialog Figma frames in the binding file covering default, selection, filter, hidden-shown, error, truncated, degraded, and first-run states at desktop and compact widths, from Kit atoms and tokens with node names equal to the React exports
- `2026-07-15-workspace-picker-dialog-P01-summary` - `workspace-picker-dialog` `P01` summary
- `2026-07-15-workspace-picker-dialog-P02-S02` - Add per-entry is_hidden (dotname or OS hidden attribute), the hidden request param (default false, applied pre-cap), and the q name-filter param (applied pre-cap), with unit tests for cap-after-filter and stated truncation
- `2026-07-15-workspace-picker-dialog-P02-S03` - Add per-entry is_registered via the engine workspace registry and the roots-level places block (home directory plus drives with labels), with unit tests
- `2026-07-15-workspace-picker-dialog-P02-S04` - Carry a typed machine reason (not_a_directory, not_a_git_workspace, already_registered, unreadable) in the add_workspace refusal envelope beside the human message, with route tests
- `2026-07-15-workspace-picker-dialog-P02-S05` - Run cargo fmt --check and clippy for the touched crates and confirm exit 0
- `2026-07-15-workspace-picker-dialog-P02-summary` - `workspace-picker-dialog` `P02` summary
- `2026-07-15-workspace-picker-dialog-P03-S06` - Extend the fs-list wire types and useFsList seam with q and hidden params, the enriched entry fields, the places block, placeholderData keepPreviousData, and a typed add_workspace refusal reason on the engine client error surface, with stores tests
- `2026-07-15-workspace-picker-dialog-P03-S07` - Rebuild the folder browser with select-then-confirm rows, clickable breadcrumbs, level filter box, hidden toggle with de-emphasized rows, registered markers, and preserved keyboard focus across level changes, with pure-resolver tests
- `2026-07-15-workspace-picker-dialog-P03-S08` - Add the places rail (home, drives, registered projects, recents) composed from the served places block and the existing useWorkspaces and useProjectHistory seams, collapsing to a chip row on compact, with tests
- `2026-07-15-workspace-picker-dialog-P03-S09` - Rebuild the dialog: full-height browser body, unified path field (typing re-roots the browser, segment autocomplete, Enter never registers), footer confirm labeled with the selected folder name, and typed-reason error mapping deleting the message-regex mapper, with tests
- `2026-07-15-workspace-picker-dialog-P03-S10` - Run the full frontend gate (eslint, prettier, tsc, vitest) and confirm exit 0
- `2026-07-15-workspace-picker-dialog-P03-summary` - `workspace-picker-dialog` `P03` summary
- `2026-07-15-workspace-picker-dialog-P04-S11` - Live-drive the redesigned dialog against a real serve on the canonical dev port (browse, filter, places, select, register, refusal states) and capture evidence
- `2026-07-15-workspace-picker-dialog-P04-S12` - Route the completed diff through vaultspec-code-review and persist the audit
- `2026-07-15-workspace-picker-dialog-P04-summary` - `workspace-picker-dialog` `P04` summary

### plan

- `2026-07-15-workspace-picker-dialog-plan` - `workspace-picker-dialog` plan

### research

- `2026-07-14-workspace-picker-dialog-research` - `workspace-picker-dialog` research: `production-grade add-project folder picker`
