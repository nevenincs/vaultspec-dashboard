---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# `authoring-surface` `W03.P08` summary

Phase W03.P08 closes the authoring-surface epic: S28 deleted the three unmounted right-rail components (Inspector, NowStrip, DocHeader) with their render tests and removed a dangling `fs.readFileSync` reference in the guard test; S29 recorded the new affordances as a pending design-sync section in `frontend/figma/FRAMES.md`; S30 ran the full two-language gate and patched one test-shape gap exposed by the gate run.

Modified files:

- `frontend/src/app/menus/guardedContextMenu.test.ts` — removed `"right/Inspector.tsx"` from `mustCarrySelectText` (file deleted).
- `frontend/figma/FRAMES.md` — added "Pending design-sync — authoring-surface epic" section.
- `frontend/src/stores/view/createDocChrome.test.ts` — added `focusFeatureField: false` to the `toEqual` expectation.

Deleted files (six total):

- `frontend/src/app/right/Inspector.tsx`, `frontend/src/app/right/Inspector.render.test.tsx`
- `frontend/src/app/right/NowStrip.tsx`, `frontend/src/app/right/NowStrip.test.tsx`
- `frontend/src/app/right/DocHeader.tsx`, `frontend/src/app/right/DocHeader.render.test.tsx`

## Description

### Wave-by-wave review verdicts

- W01.P01 (plan-step tick capability): APPROVED and hardened; no revisions required.
- W01.P02 (comments plane backend): APPROVED after one HIGH fix — the heading-traverse walk did not bound its recursion depth; a per-block work limit was added.
- W02.P03 (stores wiring): APPROVED; no revisions required.
- W02.P04 (plan-step checkbox): APPROVED after one HIGH fix — the tick mutation wired the checkbox but did not disable on keyboard activation for non-present views; keyboard parity was added.
- W02.P05 (reader comment affordances): APPROVED with three MEDIUMs landed — count-chip overflow truncation, orphaned-anchor accessible label, and compact-breakpoint contrast token.
- W03.P06 (in-editor diff): APPROVED with one MEDIUM fix — the diff toggle reset `baseText` on every save rather than only on close, making the diff surface stale under rapid typing.
- W03.P07 (visible create actions): APPROVED with one MEDIUM fix — the copy-link wiki-link resolver did not round-trip the `[[stem#slug]]` section-anchor form; the fragment is now split before resolution.

### Full epic gate (S30)

- `just dev lint all`: TOML, markdown, Rust (fmt + clippy), eslint, prettier, px-scan, module-size, tsc, token-drift, figma:names — all exited 0.
- `cargo test -p vaultspec-api`: 728 unit tests + all integration test binaries (comments, plan-tick, adversarial, salience, search, provisioning, rag-live-search) — all passed.
- `npx vitest run` (frontend/): 347 test files, 2948 tests — all passed after patching one pre-existing gap.

### Named follow-ons

- Plan-tick core-side blob fence: the plan-tick concurrency fence is weaker than other ledgered writes until `vaultspec-core vault plan step check/uncheck` supports an expected-content-hash flag; upstream ask to file against `vaultspec-core`.
- Plan-tick check/uncheck rollback inverse: the ledgered `SetPlanStepState` changeset has no registered delete-inverse (no `vault plan step` delete verb exists in `vaultspec-core`); deferred upstream-gated, same as the ledgered-edit migration precedent.
- Sub-section comment anchoring / finer selector: comments anchor at heading-section granularity; span-level anchoring is a named follow-on, not scope creep in V1.
- Per-human comment attribution pending sign-in: the actor-ref field in the comments schema is structurally present but attribution is single-principal (no sign-in). Multi-author threads require the sign-in surface.
- Diff-under-typing debounce ceiling: the diff panel re-renders on every keystroke; a debounce ceiling is the named follow-on to avoid jitter on large documents.
- Pending Figma design-sync: eight new affordances from this epic are recorded in `frontend/figma/FRAMES.md` under "Pending design-sync — authoring-surface epic" and need a designer to mirror them into the binding Figma file before the divergence entry can be retired.
