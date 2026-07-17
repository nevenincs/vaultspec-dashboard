---
tags:
  - '#plan'
  - '#workspace-picker-dialog'
date: '2026-07-15'
modified: '2026-07-17'
tier: L2
related:
  - '[[2026-07-14-workspace-picker-dialog-adr]]'
  - '[[2026-07-14-workspace-picker-dialog-research]]'
---

# `workspace-picker-dialog` plan

### Phase `P01` - Figma design frames

Close the design-system violation first (ADR D7): author the binding Figma frames for the redesigned picker dialog before any code, composed from Kit atoms and semantic tokens, node names equal to the React exports.

- [x] `P01.S01` - Author the picker dialog Figma frames in the binding file covering default, selection, filter, hidden-shown, error, truncated, degraded, and first-run states at desktop and compact widths, from Kit atoms and tokens with node names equal to the React exports; `figma:SlhonORmySdoSMTQgDWw3w`.

### Phase `P02` - Engine /fs/list enrichment and typed refusals

Serve the new display truth from the engine (ADR D4, D6): hidden and registered markers, the places block, pre-cap q and hidden params, and typed add_workspace refusal reasons - additive wire-contract event, fully unit-tested, Rust gate green.

- [x] `P02.S02` - Add per-entry is_hidden (dotname or OS hidden attribute), the hidden request param (default false, applied pre-cap), and the q name-filter param (applied pre-cap), with unit tests for cap-after-filter and stated truncation; `engine/crates/vaultspec-api/src/routes/fs_browse.rs`.
- [x] `P02.S03` - Add per-entry is_registered via the engine workspace registry and the roots-level places block (home directory plus drives with labels), with unit tests; `engine/crates/vaultspec-api/src/routes/fs_browse.rs`.
- [x] `P02.S04` - Carry a typed machine reason (not_a_directory, not_a_git_workspace, already_registered, unreadable) in the add_workspace refusal envelope beside the human message, with route tests; `engine/crates/vaultspec-api/src/routes (session add_workspace seam)`.
- [x] `P02.S05` - Run cargo fmt --check and clippy for the touched crates and confirm exit 0; `engine/`.

### Phase `P03` - Frontend picker rebuild

Rebuild the dialog on the enriched projection (ADR D1-D5): select-then-confirm browser as the dialog body, breadcrumbs, places rail, level filter, unified path field with autocomplete, typed-reason error mapping replacing the message regex - all five entry points untouched.

- [x] `P03.S06` - Extend the fs-list wire types and useFsList seam with q and hidden params, the enriched entry fields, the places block, placeholderData keepPreviousData, and a typed add_workspace refusal reason on the engine client error surface, with stores tests; `frontend/src/stores/server (engine.ts, queries/fsBrowse.ts, queries/workspaces.ts)`.
- [x] `P03.S07` - Rebuild the folder browser with select-then-confirm rows, clickable breadcrumbs, level filter box, hidden toggle with de-emphasized rows, registered markers, and preserved keyboard focus across level changes, with pure-resolver tests; `frontend/src/app/left/FolderBrowser.tsx`.
- [x] `P03.S08` - Add the places rail (home, drives, registered projects, recents) composed from the served places block and the existing useWorkspaces and useProjectHistory seams, collapsing to a chip row on compact, with tests; `frontend/src/app/left (places rail within the picker)`.
- [x] `P03.S09` - Rebuild the dialog: full-height browser body, unified path field (typing re-roots the browser, segment autocomplete, Enter never registers), footer confirm labeled with the selected folder name, and typed-reason error mapping deleting the message-regex mapper, with tests; `frontend/src/app/left/AddProjectDialog.tsx`.
- [x] `P03.S10` - Run the full frontend gate (eslint, prettier, tsc, vitest) and confirm exit 0; `frontend/`.

### Phase `P04` - Verification and review

Prove the surface: live-drive the dialog against a real serve, run the full lint gates, route the diff through vaultspec-code-review, and persist the audit.

- [x] `P04.S11` - Live-drive the redesigned dialog against a real serve on the canonical dev port (browse, filter, places, select, register, refusal states) and capture evidence; `frontend/ (live verification harness)`.
- [x] `P04.S12` - Route the completed diff through vaultspec-code-review and persist the audit; `land any required revisions before closing; `.vault/audit/2026-07-15-workspace-picker-dialog-audit.md`.

## Description

Rebuild the add-project workspace picker into a production folder picker per the
accepted ADR (see related): Figma frames first (D7), then the engine `/fs/list`
projection enrichment and typed `add_workspace` refusal reasons (D4, D6), then the
frontend dialog rebuild on the enriched projection (D1 select-then-confirm, D2
breadcrumbs and preserved focus, D3 places rail, D5 unified path field), closing
with live-drive verification and a mandatory code review. Registration semantics,
the shared `left-rail:add-project` action id, and all five entry points stay
untouched.

## Steps

## Parallelization

P01 (Figma) and P02 (engine) share no files and may run in parallel. P03 depends
on P02 (it consumes the enriched wire shape) and on P01 (the frames bind the
visual contract). Within P02, S02 and S03 touch the same route file and run
sequentially; S04 is independent of both. Within P03, S06 lands first (the wire
seam), then S07 and S08 may proceed in parallel, then S09 composes them; the gate
steps (S05, S10) close their phases. P04 is strictly last.

## Verification

- Engine: new `/fs/list` fields and params covered by Rust unit tests; cargo fmt
  and clippy exit 0 (S05).
- Frontend: pure-resolver and stores tests cover the new projection and dialog
  behaviors; the full frontend gate (eslint, prettier, tsc, vitest) exits 0 (S10).
- Live: the dialog is driven against a real serve on the canonical dev port and
  the browse, filter, places, select, register, and refusal flows behave per the
  ADR (S11).
- Review: vaultspec-code-review approves the diff and the audit is persisted
  (S12); required revisions land before the plan closes.
- The plan is complete when every Step row is checked.
