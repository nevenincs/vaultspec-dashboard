---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S37'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace figma-parity-reconciliation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S37 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Rebuild the discover overlay from its binding frame over the preserved rag-backed discover query and ## Scope

- `frontend/src/app/stage/Discover.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Rebuild the discover overlay from its binding frame over the preserved rag-backed discover query

## Scope

- `frontend/src/app/stage/Discover.tsx`

## Description

- Rebuilt the node-scoped semantic discover overlay faithfully to its binding Figma frame (17:778) on the canonical Figma radius and elevation scales, migrating the trigger chip, the panel, the close button, and the per-candidate pin button from the legacy radius/shadow alias shims.
- Migrated the trigger chip to `rounded-fg-xs` + `shadow-fg-raised`, the panel to `rounded-fg-md` + `shadow-fg-overlay`, and the inner affordances to `rounded-fg-xs`.
- Confirmed the discover-offline degraded state stays read from the stores-derived discovery view (the tiers truth surfaced through `useDiscover`), never from a bare transport error.
- Left the dumb-projection contract unchanged: the panel consumes the interpreted `useDiscover` view and emits pin/unpin/select intent, fetches nothing, and reads no raw tiers block.

## Outcome

The discover overlay now draws on the canonical Figma radius/elevation foundation while remaining a dumb projection over the preserved rag-backed `useDiscover` query. Candidates stay visually quarantined (the question-mark-qualified semantic mark, the session-only pin), the offline state reads from tiers, and the surface mints no model and never fetches. The file is eslint-clean and prettier-clean.

## Notes

The discover-offline truth is derived in the stores layer (`deriveDiscoverView` over the discover query's tiers/error), so the overlay consumes a derived `offline` flag rather than reading the raw tiers block — degradation-is-read-from-tiers is honored without change. The shared worktree's concurrent uncommitted scene WIP still fails the full-tree eslint/tsc steps, outside this scope and not introduced here.
