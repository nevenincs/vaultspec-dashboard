---
tags:
  - '#adr'
  - '#plan-structure-tolerance'
date: '2026-06-15'
modified: '2026-06-15'
related:
  - "[[2026-06-14-dashboard-pipeline-wire-adr]]"
  - "[[2026-06-15-dashboard-pipeline-status-audit]]"
  - "[[2026-06-14-dashboard-activity-rail-research]]"
---



# `plan-structure-tolerance` adr: `tolerant plan-structure parsing for legacy plans` | (**status:** `accepted`)

## Problem Statement

The production-data hardening pass (`2026-06-15-dashboard-pipeline-status-audit`, finding
F1) found that the plan-container interior - the Work tab's expandable step tree - returns
an honest-empty tree for plans NOT authored in the strict canonical wave/phase/step
structure. The parser requires backtick-wrapped canonical ids (`### Phase \`W01.P01\``,
`- [ ] \`W01.P01.S01\``). Real production vaults are mixed: only about 53% of one corpus
and 24% of another use that form; the rest are older plans with prose phase headings
(`### Phase 1 - Scaffolding`, `## Phase 1: Core API`) and plain checklist steps
(`- [ ] \`ModeloCode\` StrEnum ...`) whose first backtick wraps a symbol, not a canonical
id. For these the parser mints no containers, so the step tree is empty even though the
lifecycle progress ring (a raw checkbox count) shows N steps.

This ADR decides how the parser should treat legacy plans so the step tree is useful for
them, without compromising the canonical path or the identity guarantees the wire depends
on. It is a parser-semantics decision (it touches what entities the engine mints and their
stable keys), which is why it is recorded as an ADR rather than a silent fix.


## Considerations

- **A full structural tolerant parser is the wrong tool.** Legacy formats vary widely -
  prose `### Phase N - Title`, `## Phase N: Title (Completed)`, steps living in a separate
  `## Acceptance checklist` section tagged `- Phase N` rather than nested under their phase
  heading. Inferring waves/phases and grouping steps from this prose is heuristic, fragile,
  and would mis-capture non-step checkboxes as steps. The mis-parse risk outweighs the
  benefit of reconstructing a grouped tree for documents that are not authored to the
  contract.
- **Consistency with the already-shipped progress ring is the anchor.** The lifecycle
  progress (`done`/`total`) the Work surface already renders is a raw count of every
  two-state checkbox in the document body. A fallback that lists exactly those same
  checkboxes as a flat step list introduces no new inconsistency: the tree and the ring
  count the same items by construction.
- **Canonical plans must be untouched.** The strict canonical parse is authoritative and
  identity-stable; the fallback must never alter how a canonical plan is parsed, only fill
  the gap when no canonical step rows exist.
- **Identity stability is weaker for legacy and that is acceptable.** Canonical steps carry
  template-fixed ids (`W01.P01.S01`); a flat fallback can only derive positional ids
  (`S01`, `S02`, ... by document order). Positional ids re-key if the legacy document's
  checkboxes are added, removed, or reordered. This is acceptable because legacy plans are
  display-only historical artifacts, not the live-edited canonical set the GUI animates and
  time-travels by id; the live churn risk `provenance-stable-keys-are-identity-bearing`
  guards against does not apply to documents that are not being canonically edited.

## Constraints

- **Parent stability.** The plan-container minting, the bounded plan-interior projection,
  and the Work surface (which already renders the L1 flat-steps shape) are shipped and
  stable from `2026-06-14-dashboard-pipeline-wire`. The fallback emits exactly the existing
  L1 `PlanStructure` shape (`waves: []`, `phases: []`, flat `steps`), so no minting,
  projection, or surface code changes - the change is confined to the parser.
- **Bounded.** The fallback honors the same `MAX_PLAN_STRUCTURE_NODES` ceiling with honest
  truncation as the canonical parse.
- **No frontier risk.** Pure deterministic string parsing over the document body; no new
  dependency.

## Implementation

The parser becomes canonical-first with a legacy fallback, confined to
`ingest-struct`'s plan-structure parser:

- Parse strictly as today. If the strict parse yields at least one step (anywhere in
  waves, phases, or the flat list), return it unchanged - the canonical path is
  authoritative and fully preserved.
- Only when the strict parse yields zero steps, run the fallback: scan the document body
  for every two-state checkbox line (`- [ ]` / `- [x]` / `- [X]` at any indent), emit each
  as a flat `PlanStep` with a positional id (`S01`, `S02`, ... in document order), the
  action text taken from the line after the checkbox glyph, and completion read from the
  glyph. The result is the existing L1 shape - flat `steps`, no waves or phases - bounded
  by the same ceiling with the same honest truncation block.

The Work surface then renders a flat checklist for a legacy plan (the same items its
progress ring counts) and the full wave/phase/step tree for a canonical plan, with no
change to the surface, the projection, or the minting.

## Rationale

The flat-checklist fallback resolves F1 meaningfully - the step tree stops being empty for
the majority-share of real plans - at the lowest risk, because it reuses the exact checkbox
set the shipped progress ring already trusts and emits the exact L1 structure the rest of
the pipeline already handles. It deliberately declines to reconstruct phase grouping from
legacy prose, because that inference is where the mis-parse risk lives and the grouping is
not load-bearing for the Work surface (a flat, accurate list is more honest than a guessed
hierarchy). Canonical plans - the contract going forward - keep their full identity-stable
tree untouched.

## Consequences

- **Gain:** the Work tab's step tree populates for legacy plans with the real checklist
  items, consistent with the progress ring; the empty-tree gap from F1 closes for the
  common case.
- **Cost / honesty:** legacy step ids are positional and may re-key if the legacy document
  is edited; legacy plans render as a flat list, not a grouped tree. Both are stated in the
  surface as the L1 shape (no phantom hierarchy) and are acceptable for display-only
  historical plans.
- **Pitfall avoided:** by gating the fallback on the absence of canonical steps, a
  canonical plan with incidental checkboxes elsewhere is never re-parsed by the fallback;
  the authoritative path always wins.
- **Pathway:** if a future need arises to group legacy steps, it can layer on top of this
  flat baseline behind an explicit heuristic, without disturbing the canonical path.

## Codification candidates



