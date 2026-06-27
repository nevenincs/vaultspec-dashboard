---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S21'
related:
  - "[[2026-06-14-node-visual-richness-plan]]"
---

# Extend the hover-bloom card with per-document-type content + category-accent strip (Figma 110:2), derived purely from the wire projection

## Scope

- `frontend/src/app/islands/HoverCardLayer.tsx`

## Description

Extended the existing hover-bloom card delivered by this feature (the P04 work)
so its CONTENT is conditional on the document type rather than one generic shape,
matching the Figma 110:2 redesign. Reused the card; did not rebuild it.

- Added a pure projection seam `hoverCardContent.ts` that folds an engine node
  (plus, for plans, the already-cached bounded plan-interior) into a discriminated
  `TypeCardContent` union: plan, adr, exec, research, audit, topic, code, generic.
  The seam fetches nothing and never reads the raw tiers block.
- Extended the card model with an optional category (the eight scene categories)
  and the typed content block, and rendered a single-token category-accent strip
  plus a per-type info plane in `HoverCard.tsx`. The accent is the per-theme
  `--color-scene-category-*` token consumed as a DOM `var()`, so theme parity is
  automatic across light, dark, and high-contrast.
- Wired the host `HoverCardLayer.tsx` to populate category and typed content from
  the node detail, and to lean on the same cached plan-interior the Work step-tree
  already fetches (enabled only for plan nodes) so the plan card can show phases
  left with no new backend route.
- Added two test files: pure derivation tests for every type's field sourcing and
  the recorded data gaps as graceful absence, and render tests for each type, the
  category accent + type identity, and per-theme token parity.

## Outcome

The card now renders type-specific content: plan tier + steps + phases-left; adr
status + a reference-degree line; research relative date; audit graded severity;
feature/index document count; code path + language. The full frontend lint gate
(`just dev lint frontend`: eslint + prettier + tsc + token-drift + figma-registry)
exits 0, and the islands suite is green (58 tests, including the 24 new ones). No
engine code was touched, so no Rust gate was required.

## Notes

This is a content extension over existing projections (`views-are-projections-of-
one-model`), not an interaction-model change, so it did not warrant its own ADR; it
extends the node-visual-richness hover card directly and is recorded as a step in
that feature's P04.

Data gaps hit (rendered as graceful absence, never fabricated; none warrant a new
backend route on their own — flagged here for a future decision):

- adr "supersedes N": no distinct wire field. A superseding relationship is a
  lineage edge, not a hover-detail field; the card shows a reference-degree proxy
  (summed incident degree) instead. A dedicated supersedes count would need a
  graph-derived field.
- exec parent-plan title: the node detail's `interior` is populated only for plan
  nodes, so the parent plan is not reachable from the hover detail; the "in plan —
  {title}" line is omitted. Would need either an edge lookup in the host or a
  parent-plan field on the exec node projection.
- research / audit findings counts: not carried on the node wire; omitted. A
  findings count would need an engine projection.
- audit verdict: the wire carries a graded SEVERITY (high/critical/medium/low),
  not a PASS/FAIL verdict; severity is surfaced as the audit status.
- code git-dirty: a tree-level boolean on `/status`, not a per-node field; the card
  accepts it as an optional host-supplied flag but does not fetch it per node.
