---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S31'
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
     The S31 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The persist worktree selection through the session API and ## Scope

- `frontend/src/app/left/WorktreePicker.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# persist worktree selection through the session API

## Scope

- `frontend/src/app/left/WorktreePicker.tsx`

## Description

- On a worktree pick, persist the selection durably through
  `usePutSession({ active_scope })` so it survives a reload, keeping the immediate
  `setScope(worktree.id)` for responsiveness (the durable write rides alongside
  the optimistic UI move).
- Surface a rejected switch gracefully: a `switchError` state holds a message set
  from the mutation's `onError` — a tiered 400 (unknown/non-vault scope) reports
  "could not switch", any other failure reports "could not persist"; rendered as
  a small status line under the picker rather than failing silently.
- Imported `EngineError` to distinguish the 400 rejection from a transport fault,
  and `usePutSession` from the stores query layer (the chrome consumes the stores
  mutation, never fetches).

## Outcome

Switching worktrees now persists durably through the session API, so the chosen
worktree is the one restored on the next reload; a rejected switch is reported in
the picker. The existing WorktreePicker / VaultBrowser / browserSelection suites
stay green.

## Notes

The immediate `setScope` plus the durable `putSession` is the responsive-then-
durable pattern the ADR's prototype posture calls for. No skips, no stubs.
