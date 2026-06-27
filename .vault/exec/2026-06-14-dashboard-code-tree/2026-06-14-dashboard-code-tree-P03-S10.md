---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S10'
related:
  - "[[2026-06-14-dashboard-code-tree-plan]]"
---

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
