---
tags:
  - '#plan'
  - '#document-edit-hardening'
date: '2026-06-18'
modified: '2026-06-25'
tier: L3
related:
  - '[[2026-06-18-document-edit-hardening-adr]]'
  - '[[2026-06-18-document-edit-hardening-research]]'
---

# `document-edit-hardening` plan

## Wave `W01` - Engine brokers the project-pinned core

Make the engine resolve and verify the project-pinned vaultspec-core it brokers so writes can never silently fail on a stale global. Blocking precondition for every other wave; backed by the document-edit-hardening ADR finding F1.

Make the document edit feature live-usable and fully bidirectional, engine-brokered end to end, closing every gap the live drive found.

### Phase `W01.P01` - Core resolution and capability verification

Resolve the brokered core to the project-pinned environment and verify the required verbs are present, degrading with an honest advisory on a miss.

- [x] `W01.P01.S01` - Resolve the brokered core invocation to the project-pinned environment instead of an arbitrary PATH binary; `engine/crates/ingest-struct/src/runner.rs`.
- [x] `W01.P01.S02` - Verify the resolved core advertises the required write verbs at the write boundary and degrade the write tier with an honest advisory on a capability miss; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `W01.P01.S03` - Live-verify a brokered set-body write succeeds against the pinned core and a missing-verb core degrades with a tiered advisory not an exit-2 passthrough; `engine/crates/vaultspec-api/src/routes/ops.rs`.

## Wave `W02` - Core rename verb and engine rename broker

Author a conformant document-rename verb in vaultspec-core (cross-repo) and broker it through the engine /ops write channel. Depends on W01; unblocks the stores re-keying in W03; backed by ADR finding F5.

### Phase `W02.P02` - vaultspec-core rename verb (external repo)

Author and release a conformant vault document-rename verb in the core repository via its gh-issue, worktree, PR, and release flow.

- [x] `W02.P02.S04` - File a gh issue and bootstrap a worktree in the vaultspec-core repo for a conformant vault document-rename verb; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `W02.P02.S05` - Author vault rename: validate target stem, atomic rename, rewrite incoming related references, refresh modified, run checks and refuse on ERROR, emit json envelope with old and new path id and blob, accept expected-blob-hash and dry-run; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `W02.P02.S06` - Land the rename verb via PR with green CI, release the wheel, and bump the dashboard core pin; `pyproject.toml`.

### Phase `W02.P03` - Engine rename broker

Add the rename verb to the engine core write whitelist with full per-field injection-guard validation and verbatim envelope forwarding.

- [x] `W02.P03.S07` - Add rename to the engine core write whitelist with per-field injection-guard validation of the target stem and a collision pre-check; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `W02.P03.S08` - Live-verify the brokered rename POST returns old and new id and path and refuses a non-conformant target with advisories; `engine/crates/vaultspec-api/src/routes/ops.rs`.

## Wave `W03` - Stores bidirectional coupling, re-keying, fidelity

Harden the frontend state coupling: rename re-keying across tab/editor/selection, guaranteed open-editor refresh after re-ingest, frontmatter merge, and UTF-8 round-trip fidelity. Depends on W02; backed by ADR findings F3, F4, F7.

### Phase `W03.P04` - Rename re-keying and open-editor refresh

Re-key the open tab, editor slice, and shared selection on rename, and guarantee the open editor and dependent views refresh after re-ingest.

- [x] `W03.P04.S09` - Add a useRenameDoc mutation routing through ops that re-keys the open tab, editor slice, and shared selection atomically from the old to the new doc id; `frontend/src/stores/server/queries.ts`.
- [x] `W03.P04.S10` - Extend post-write invalidation so the open editor content view re-reads after backend re-ingest; `frontend/src/stores/server/queries.ts`.
- [x] `W03.P04.S11` - Live-verify the SSE generation-bump heals the write-then-refetch timing race so dependent views are never left stale; `frontend/src/stores/server/queries.ts`.

### Phase `W03.P05` - Frontmatter merge and UTF-8 fidelity

Send merged canonical frontmatter so a partial edit is never refused, and verify and fix arbitrary-Unicode round-trip fidelity end to end.

- [x] `W03.P05.S12` - Send merged canonical frontmatter on a frontmatter write so a partial edit preserves the directory and feature tags and is never refused; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `W03.P05.S13` - Verify and fix UTF-8 round-trip fidelity across the engine-to-core stdin path with a controlled Unicode payload through the real stores client; `engine/crates/vaultspec-api/src/routes/ops.rs`.

## Wave `W04` - App advisories, action-mapping, full-text edit

Surface conformance advisories and autofix in the editor, map UI create/edit actions onto the engine brokers, and complete full-text body and frontmatter editing in managed state. Depends on W03; backed by ADR findings F3, F6.

### Phase `W04.P06` - Conformance advisory surfacing

Surface the field-level conformance checks as per-issue advisories with an autofix action, replacing the generic failure state.

- [x] `W04.P06.S14` - Surface field-level conformance checks as per-issue advisories with severity message and fixable in the editor replacing the generic failure state; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `W04.P06.S15` - Add an autofix action that forwards vault check fix through the engine broker; `frontend/src/app/viewer/MarkdownDocView.tsx`.

### Phase `W04.P07` - Action-mapping and full-text edit

Map the UI create and edit actions onto the engine create and write brokers and complete full body and frontmatter editing in managed state.

- [x] `W04.P07.S16` - Map the UI create actions onto the engine create broker via a typed action registry covering the vault doc types; `frontend/src/app/menus/registerAll.ts`.
- [x] `W04.P07.S17` - Complete full body and frontmatter editing enrolled in the bounded managed editor state; `frontend/src/app/viewer/MarkdownDocView.tsx`.

## Wave `W05` - End-to-end live verification and review

Prove the whole feature live against real vault documents (save, rename, create, conflict, refusal-with-advisory, dependent-view refresh) and route through the full gate and code review. Depends on W01-W04.

### Phase `W05.P08` - End-to-end live verification and review

Drive the live interface and brokered APIs against real vault documents, run the full gate, and route to code review.

- [x] `W05.P08.S18` - Drive the live interface and brokered POST APIs against real vault docs for save rename create conflict refusal-with-advisory and dependent-view refresh and record evidence; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `W05.P08.S19` - Run the full engine and frontend lint and test gate and route to code review; `frontend/src/app/viewer/MarkdownDocView.tsx`.

## Description

This plan executes the document-edit-hardening ADR: it makes the document edit
feature live-usable and fully bidirectional, engine-brokered end to end, never
exposing the frontend to `vaultspec-core` or `vaultspec-rag`. W01 fixes the blocking
precondition the live drive exposed (the engine brokering a stale global core that
lacks the edit verbs). W02 authors the net-new document-rename verb in
`vaultspec-core` and brokers it through the engine `/ops` write channel. W03 hardens
the stores state coupling (rename identity re-keying, guaranteed open-editor
refresh, frontmatter merge, UTF-8 fidelity). W04 surfaces the field-level
conformance advisories, maps create and edit actions onto the engine brokers, and
completes full-text body and frontmatter editing. W05 proves the whole feature live
against real vault documents and routes to review. It is grounded in the live
findings of the research and the decisions of the ADR carried in the `related:`
frontmatter.

## Steps

## Parallelization

Waves are sequenced. W01 (core resolution) gates all writes and must land first. W02
depends on W01, and its core-repo release gates the engine rename broker. W03 depends
on the W02 rename broker. W04 depends on W03. W05 verifies W01 through W04. Within
W02, the core verb authoring (P02) and the engine broker (P03) are sequential because
the broker needs the released verb. Within W03, the re-keying phase (P04) and the
frontmatter-merge plus UTF-8 phase (P05) share no hard dependency and may run in
parallel. Within W04, advisory surfacing (P06) and action-mapping plus full-text edit
(P07) may run in parallel. Each live-verify Step runs after its implementation Step
in the same Phase.

## Verification

The plan is complete when every Step is closed and each criterion below is verified
live against real vault documents, not tests alone:

- A brokered `set-body`, `set-frontmatter`, `rename`, and `create` POST each succeed
  live against a real vault document with the correct pinned core, and a
  missing-verb core degrades with a tiered advisory rather than a cryptic exit-2.
- A title or stem rename renames the file on disk, rewrites incoming `related:`
  references, and atomically re-keys the open tab, editor slice, and shared
  selection from the old to the new `doc:<stem>`.
- A non-conformant edit surfaces the field-level conformance advisories
  (severity, message, fixable) in the editor and offers an autofix action; a partial
  frontmatter edit is never spuriously refused.
- Arbitrary Unicode prose round-trips byte-faithfully through the edit path.
- A write reliably refreshes every dependent view (reader, graph, tree) through
  backend re-ingest and the SSE signal, with the open editor itself refreshed.
- The frontend never calls `vaultspec-core` or `vaultspec-rag` directly.
- The full engine and frontend lint and test gate is green and code review is PASS.
