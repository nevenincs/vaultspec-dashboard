---
tags:
  - '#research'
  - '#left-rail-tier-presentation'
date: '2026-07-15'
modified: '2026-07-15'
related:
  - "[[2026-07-14-frontend-localization-research]]"
  - "[[2026-07-03-left-rail-tree-controls-research]]"
  - "[[2026-07-14-frontend-localization-adr]]"
  - "[[2026-07-03-left-rail-tree-controls-adr]]"
---

# `left-rail-tier-presentation` research: `Plan tier presentation in the document tree`

This research resolves whether the general document tree should continue showing plan
tiers after the localization architecture prohibited implementation difficulty and
unexplained internal vocabulary from user-facing copy. It compares omission, translation,
explanation, and contract removal while preserving the useful plan-progress signal.

## Findings

### F1 - Two accepted decisions conflict at one presentation clause

The tree-controls decision requires plan rows to show the served `L1` through `L4` value
as “Tier N”. The later localization decision prohibits tier identifiers, implementation
difficulty, and unexplained internal terms in general UI copy. The conflict is limited to
the tier line: dates, decision status, plan progress, document weight, sorting, and tree
structure remain compatible. Sources: `.vault/adr/2026-07-03-left-rail-tree-controls-adr.md:85`
and `.vault/adr/2026-07-14-frontend-localization-adr.md:91`.

### F2 - Translation does not create user meaning

The current helper converts `L2` to “Tier 2”, which hides the raw token without explaining
what is classified, how tiers differ, or what a user can do with the value. The document
tree has no tier definition, comparison, filtering, or tier-specific action. Renaming the
value therefore preserves the implementation-difficulty leak. Source:
`frontend/src/app/left/vaultRowPresentation.ts:295`.

### F3 - Plan progress is the useful general-tree signal

Served completed-step counts and the states not started, in progress, and complete describe
current work in familiar terms. They remain truthful, actionable review information and do
not depend on the tier classification. Tier removal does not require removing progress,
dates, size, or decision status. Source: `frontend/src/app/left/TreeBrowser.tsx:1214`.

### F4 - Presentation removal does not require a wire change

The engine and tolerant adapter may continue carrying plan tier as governed architecture
data. TreeBrowser can stop deriving and appending the tier tooltip line without changing
identity, requests, sorting, filtering, or other consumers. Retaining the field also leaves
room for a separately governed expert surface that defines the concept and establishes a
user need. Source: `frontend/src/app/left/TreeBrowser.tsx:1340`.

### F5 - Omission is the smallest safe option

- Rendering `L1` through `L4` exposes a raw internal token.
- Rendering “Tier 1” through “Tier 4” translates spelling but not meaning.
- Adding explanatory help to every tooltip increases navigation density for a value with no
  immediate action.
- Removing the wire field expands the change beyond presentation and affects valid governed
  data.
- Keeping the field while omitting it from general TreeBrowser output resolves the conflict
  at the narrowest boundary.

Recommendation: partially supersede only the tree-controls D1 tier-presentation clause.
Keep plan tier in the wire and data model, preserve localized plan progress, and require all
known, malformed, and future tier values to remain absent from visible, accessible, and
tooltip output in the general document tree.
