---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S11'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace authoring-surface with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S11 and 2026-07-12-authoring-surface-plan placeholders are machine-filled by
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
     The Live-wire tests for the new hooks over the fixture vault, including the comment SSE delta path and ## Scope

- `frontend/src/stores/server` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Live-wire tests for the new hooks over the fixture vault, including the comment SSE delta path

## Scope

- `frontend/src/stores/server`

## Description

- Added `comments.live.test.ts` running ONLINE against the real `vaultspec serve` engine over the committed fixture vault (no `vi.mock` of the wire), exercising the genuine `AuthoringClient` end to end.
- Comment coverage: create then list ANCHORED against a live heading section (the section selector's `expected_content_hash` is computed from the git blob spec, matching how the reader affordance will build it); ORPHANED via content-hash mismatch and via missing anchor (backend-served `orphaned` flag + typed evidence); a full edit/resolve/reopen/delete round-trip with idempotent re-delete.
- SSE delta path: after a create, the finite authoring event replay is read through `sseChunks` + `adaptAuthoringStreamFrame` and asserted to carry a `comment` aggregate lifecycle event.
- Plan-tick coverage: tick S02 through the ledgered direct-write, poll the served plan-interior until `done` flips, prove an idempotent re-tick is success, then RESTORE S02 in a `finally` (settled via polling) so no sibling file observes the transient state; plus a stale-base tick resolving as a `conflict` value.
- Canonicalized the fixture plan so the plan CLI can tick it: added the mandatory `tier: L1` frontmatter field and put the two Steps in canonical form (backticked ids + `;` scope) directly under the H1, preserving the `[x] S01` / `[ ] S02` progress state the filter-plan-state live test depends on.
- Repointed a pre-existing stale guard path (`guardedContextMenu.test.ts`) from the removed `queries.ts` to the `queries/workspaces.ts` submodule where the select-text row class now lives.

## Outcome

The new file passes 7/7; the complete frontend vitest suite passes 2879/2879 (including the filter-plan-state and guard tests that read the same fixture). `npx tsc --noEmit` and `eslint`/`prettier` are clean.

## Notes

- Mutation safety rests on `fileParallelism: false` (files run sequentially against one shared engine): the plan-tick block ticks then restores S02, and the restore waits for the watcher re-ingest to settle. The tick leaves a `modified:` frontmatter stamp drift on the plan (the CLI stamps it), unobserved by any test.
- The hand-authored non-canonical fixture plan was silently mis-parsed by the plan CLI (it defaulted a tier-less plan to L2 and dropped the flat steps); the canonical `tier: L1` + backticked-id + `;`-scope form under the H1 is required for the CLI mutation-parser, though the engine's read-parser tolerated the looser form.
- Full `just dev lint frontend` currently exits non-zero on a FOREIGN uncommitted deletion of an engine crate file tripping the module-size baseline — unrelated to this phase; eslint, prettier, tsc, and the full vitest suite are green for this work.
