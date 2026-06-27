---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# `figma-parity-reconciliation` `W02.P04` summary

P04 rebuilt the shell frame and the left-rail browser family onto the canonical
Figma role-named token foundation laid in W01.P01. Across the five Steps the
deprecated alias surface (dense-metadata type aliases, the legacy radius and
brand-elevation scales) was re-keyed to the generated foundation utilities -
caption type role, the xs and md radius steps, and the three-level raised shadow -
so every shell and rail surface now consumes the foundation directly rather than
the deprecated shims. Each surface stayed a dumb projection over its preserved
hook: nothing in the phase fetched, mutated a stores shape, or read the raw tiers
block.

The shell (S23) kept its four-region grid intact, reading rail-collapse from the
view store and bridging the theme and consumed-settings effects once at the top,
with the backend-signal stream mounted once. The left rail (S24) re-keyed its
browser-mode toggle and rail filter while remaining a pure composition over the
per-scope browser-mode store. The three browsers were rebuilt over their preserved
reads: the vault browser (S25) and the tree browser (S27) project the same
vault-tree query - the tree browser re-nests it feature/doc-type/document and
carries the grayscale-safe plan-progress pips - while the code tree (S26) stays
bounded and lazy over the per-level file-tree query with honest truncation. All
three read degradation only through their availability selectors, join selection on
the stable node id, and preserve the four honest states and the roving-tabindex
nav model.

Files touched across the phase:

- Modified: `frontend/src/app/AppShell.tsx`
- Modified: `frontend/src/app/left/LeftRail.tsx`
- Modified: `frontend/src/app/left/VaultBrowser.tsx`
- Modified: `frontend/src/app/left/CodeTree.tsx`
- Modified: `frontend/src/app/left/TreeBrowser.tsx`

The phase landed across commits `28b844e..b537ca7`. Each scoped file passes eslint,
prettier, and tsc cleanly, and the left-rail, vault-browser, code-tree, and
tree-browser suites stay green; the aggregate frontend gate is red only on the
concurrent W03 scene agent's in-flight, untracked scorecard files under
`frontend/src/scene/field/`, which are outside this phase's scope fence and were
not touched.

## Description

W02 carried a phase review with a PASS-WITH-NITS verdict and no CRITICAL or HIGH
findings; the foundation migration held the dumb-projection contract on every
rebuilt surface. P04's own work introduced no carry-forward of its own. The two
MEDIUM items the W02 review carried forward target W04 and are recorded in the
W02.P05 summary, where the surfaces that own them were rebuilt.
