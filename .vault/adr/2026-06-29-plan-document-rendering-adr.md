---
tags:
  - '#adr'
  - '#plan-document-rendering'
date: '2026-06-29'
modified: '2026-06-29'
related:
  - "[[2026-06-29-plan-document-rendering-research]]"
---

# `plan-document-rendering` adr: `plan reader rendering, metadata, and engine-served counting` | (**status:** `accepted`)

## Problem Statement

Plan documents are a cornerstone, fully-managed doc type (Waves -> Phases -> Steps,
each step done/not-done), yet the markdown reader rendered them as plain GFM: native
disabled checkboxes with no plan-specific treatment and no derived metadata. Separately,
the right-rail step tree showed per-wave/phase completion rollups that were computed in
the FRONTEND over the served plan-interior tree. Because that tree is bounded by a node
ceiling, a client-side rollup silently UNDERCOUNTS the moment the interior truncates, and
recomputing a displayed count in the frontend violates the standing
`display-state-is-backend-served-not-frontend-derived` discipline. This ADR settles how
plan structure metadata is served and how the reader renders a plan.

## Considerations

The plan-interior projection already descends the full plan tree under a node budget that
tracks the TRUE total even for branches dropped past the cap. A single completion-class
authority already exists for the plan-state vocabulary. The reader is dumb `app/` chrome
over the stores layer; the kit already ships every primitive the summary card needs (a
card surface, a progress track, badges). The right-rail step tree owns a done/open check
vocabulary (a filled disc vs a hollow ring) that the reader should share rather than
re-invent. Two reader treatments were weighed for the step body: restyle the authored
task-list in place, or replace it with the structured interior tree; the in-place restyle
keeps the reader a faithful render of the document body and needs no extra data.

## Constraints

No frontier risk. Everything builds on shipped, stable seams: the plan-interior route and
its node ceiling, the envelope/tiers contract, the centralized kit, and the stores
plan-interior hook. The summary card depends on the bounded plan-interior query (already
fetched by the right rail), so it adds no new unbounded read.

## Implementation

The engine plan-interior projection is extended to serve, all computed PRE-TRUNCATION over
the full tree: a per-wave and per-phase done/total rollup, and a per-plan summary block
carrying wave/phase/step counts, a completed-step count, and a derived completion state.
The completion state is derived through the ONE existing progress-to-completion authority
(shared, not re-implemented), so the per-plan state cannot drift from the plan-state filter
facet. The counts ride the existing plan-interior response through the shared envelope; no
new route. The stores layer threads the rollups and summary through its wire types and
interior view, DELETES the client-side rollup math, and exposes a small presentation view
for the card (label, tone, and a display percentage that is presentation math over the
served counts). The reader mounts a self-fetching plan summary card under the document
header for plan documents, composing the kit card/progress primitives; and a markdown
task-list override replaces the native checkbox with the shared step mark, with a scoped
style muting and striking a completed step's row.

## Rationale

Serving the counts and state pre-truncation is the only correct option: the client cannot
reconstruct a truthful rollup from a slice it received post-truncation, and the engine
already holds the true totals. Reusing the one completion authority keeps a single
classification per fact. The in-place step restyle was chosen over a structured-tree
replacement so the reader stays a faithful projection of the authored body. The card
composes the centralized kit rather than hand-built chrome.

## Consequences

The right-rail rollups become engine-authoritative and truncation-honest as a side effect
of the same change, closing a latent undercount. The reader gains a scannable plan summary
and a clear done/pending step vocabulary shared with the rail. The cost is one new bounded
fetch in the reader for plan documents (the already-cached plan-interior query) and a small
widening of the plan-interior wire shape, absorbed tolerantly by the stores adapter.

## Codification candidates

- **Rule slug:** `display-state-is-backend-served-not-frontend-derived` (EXISTING — sharpen
  in place, do not author a new rule). **Rule:** a displayed/filtered count, rollup, or
  percentage over a BOUNDED/truncatable served slice must be computed and served by the
  engine over the full set pre-truncation, never re-counted in the frontend over the
  capped slice (which silently undercounts once it truncates).
