---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S27'
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
     The S27 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The mirror the new session and settings wire shape in the mock engine double and ## Scope

- `frontend/src/testing/mockEngine.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# mirror the new session and settings wire shape in the mock engine double

## Scope

- `frontend/src/testing/mockEngine.ts`

## Description

- Added in-memory session/settings state to the mock: active scope, per-scope
  folder + feature-tag context, workspace recents, global settings, and per-scope
  scoped settings — mirroring the live store's fields exactly.
- Added `GET`/`PUT /session` and `GET`/`PUT /settings` routes serving the exact
  live `{data, tiers}` shapes: session data is `{ workspace, active_scope,
  scope_context: { folder, feature_tags }, recents }`; settings data is
  `{ global, scoped }` with `scoped` sparse-omitting empty scopes.
- `PUT /session` is partial (absent fields untouched); `active_scope` is
  validated against the vault-bearing scopes FIRST and an unknown/non-vault scope
  is a tiered 400 with the active scope left unchanged, matching the live route.
  `push_recent` pushes to the front of recents (dedup-moving).
- `/status` now echoes the active scope and `last_seq`, reflecting the selected
  worktree's cell.
- Generalized `requireScope` from "any present scope" to the live retarget
  (W02.P04.S15): scoped reads accept any vault-bearing worktree token and 400 on
  an unknown or non-vault scope, exactly as `validate_scope` does.
- `/stream` honors the optional `scope` param (read, never rejected) so the
  handshake never errors on a bad scope — live-parity fallback to the active
  scope's single timeline.

## Outcome

The mock serves the new session/settings endpoints and the W02 stream/status/
scope-retarget behavior byte-for-byte to the live shapes. Frontend `tsc -b`
passes; the mock suite and every mock-consuming suite (degradation, timeTravel)
stay green.

## Notes

This is the `mock-mirrors-live-wire-shape` deliverable; the S34 parity test feeds
a captured-live session/settings sample through the tolerant adapter to prove the
fidelity. No test doubles inside the mock beyond the in-memory store the live
crate itself is (a best-effort SQLite store); no skips.
