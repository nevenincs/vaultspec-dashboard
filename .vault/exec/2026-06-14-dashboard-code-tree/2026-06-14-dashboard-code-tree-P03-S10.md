---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S10'
related:
  - "[[2026-06-14-dashboard-code-tree-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-code-tree with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S10 and 2026-06-14-dashboard-code-tree-plan placeholders are machine-filled by
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
     The Author the code-mode view rendering the directory hierarchy as lazy collapsible disclosure rows with Lucide chevrons and Phosphor file marks and ## Scope

- `frontend/src/app/left/CodeTree.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Author the code-mode view rendering the directory hierarchy as lazy collapsible disclosure rows with Lucide chevrons and Phosphor file marks

## Scope

- `frontend/src/app/left/CodeTree.tsx`

## Description

- Author the self-contained `CodeTree` component rendering the `/file-tree` projection as a lazy, collapsible directory hierarchy: a recursive `DirectoryRow` per entry, with a child level mounted only on expansion (the lazy one-level-per-call fetch).
- Render a Lucide chevron for directory disclosure, a Phosphor `Folder`/`File` domain mark (each grayscale-distinct by shape at 14px), the basename as monospace path identity, and the full repo-relative path as the row hover title (truncating).
- Consume the corpus only through the stores hook (`useFileTree`) and degradation only through the stores selector (`useFileTreeAvailability`); the component fetches nothing itself and defines no model.
- Render the rail's four honest states (loading / empty / degraded / error) plus a subordinate per-directory liveness cue and an in-rail client-side filter that narrows the visible tree.

## Outcome

- COMMITTED (code-tree-exclusive new file): `frontend/src/app/left/CodeTree.tsx`, exporting `CodeTree` (props: `onEntryClick?`, `linkedNodeIds?`, `filter?`) plus the pure helpers `basename` / `rowMark` / `rowMarkName`.
- Verified: typecheck, eslint, and prettier all clean on the file; the render test exercises every state.

## Notes

- The component is deliberately self-contained and does NOT edit `AppShell.tsx`: it is exported for the left-rail IA host (Executor 3) to mount behind the vault/code mode toggle, per the dispatch brief.
- The Phosphor `Folder` (open container) vs `File` (dog-eared page) marks are grayscale-distinct by shape at 14px, honoring `icons-come-from-the-two-sanctioned-families`; the Lucide chevrons are the structural-chrome disclosure glyphs.
