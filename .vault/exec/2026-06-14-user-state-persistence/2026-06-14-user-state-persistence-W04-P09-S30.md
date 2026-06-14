---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S30'
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
     The S30 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The seed and persist scope and folder context in the view store through the session API and ## Scope

- `frontend/src/stores/view/viewStore.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# seed and persist scope and folder context in the view store through the session API

## Scope

- `frontend/src/stores/view/viewStore.ts`

## Description

- Added an `activeFolder` (string | null) and `featureContexts` (string[]) slice
  to the view store: the durable "which folder + which contexts" projection over
  the existing `feature_tags` grouping primitive — no new node model.
- Added `seedFromSession` (mirrors a restored session's scope + folder context
  into the store WITHOUT the wholesale reset) and `setScopeContext` (mirrors a
  user folder/context selection for synchronous reads; the durable write goes
  through the session API at the call site, never localStorage).
- Extended `setScope`'s wholesale reset to clear `activeFolder`/`featureContexts`
  too — the previous corpus's folder context must not bleed into the new scope —
  while leaving the pin/lens re-key and live-slice reset untouched.
- Wired the seed in Stage via a one-shot `useSeedSessionContext` hook (latched by
  a ref so a later session re-fetch never clobbers in-session edits): on the first
  successful `useSession` load it calls `seedFromSession` with the persisted
  `active_scope` and `scope_context`.

## Outcome

The view store now restores the active folder + feature-tag contexts from the
session on load, and the durable home for scope/folder is the session API (a
stores mutation), not localStorage — ephemeral view state (pins, lenses, position
cache) stays in localStorage as before. The existing scope-swap reset semantics
and pin/lens re-key are preserved (viewStore + isolation suites green).

## Notes

The seed-wiring hook lives in Stage (the single one-per-lifetime owner) so it
mounts once; the store action itself is the file deliverable. `seedFromSession`
sets `scope` only as a mirror — `useActiveScope` still reads the persisted scope
from the session, so the two stay consistent. No skips, no stubs.
