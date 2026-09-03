---
tags:
  - '#adr'
  - '#rail-feature-metadata'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:032560f7945e79608275378fd15a7cafb2f965cfd27e318137d491d8f81e20f2'
related:
  - "[[2026-08-01-rail-feature-metadata-research]]"
---
# `rail-feature-metadata` adr: `served feature metadata: status mark, dates, per-type counts` | (**status:** `accepted`)

## Problem Statement

Feature rows say only a name and a total count. The owner wants each feature to communicate its pipeline status in the icon slot, its age (with a defined date-range meaning), and its composition (documents per type) — in the rail's Features section, the feature search suggestions, and the rail filter field's second line, which today duplicates the tag instead of informing.

## Considerations

- Nothing displayed may be client-derived over capped listings; per-type counts, plan-state rollups, and date spans must be engine-computed over the full set (research: findings; wire-contract counts law).
- The engine already holds every input: roster entries, plan artifacts with progress/dates/feature_tags, doc dates (research: pipeline projection findings).
- The owner explicitly delegated the range semantics decision; the binding-ADR span was their named candidate.
- Iconography must stay in the sanctioned families; the status mark reuses the plan-status marks already established for tree rows (one icon per row — the first review round's law).

## Considered options

1. Extend `FeatureRosterEntry` with the three served fields; all three surfaces consume the one roster read. CHOSEN.
2. New per-feature metadata route. Rejected — fragments the per-feature read and its caching.
3. Client derivation. Rejected — violates the counts law by construction.

## Constraints

- D1 — Wire: `FeatureRosterEntry` grows `type_counts` (doc-type → count over the FULL corpus), `plan_state?` (`not-started` | `in-progress` | `finished` — the engine's one documented plan-state vocabulary, facet-validated; absent when the feature has no readable plan; engine rollup: finished iff all counted plans finished, in-progress iff any in progress, else not-started; amended in place from `planned` when execution surfaced the established authority), and `adr_dates?` (`{first, last}` ISO dates over the feature's ADRs; absent when no ADR). Additive, tolerant-adapter absorbed; a contract event reviewed once here.
- D2 — Range meaning is DEFINED as the binding-ADR span: displayed as one date when first == last, else "first – last". The row's accessible label spells it out ("decisions from {first} to {last}"). Other candidates (corpus span) are rejected, not deferred — one meaning, recorded here.
- D3 — Status mark occupies the feature row's ICON slot (one icon per row): finished = the acceptance/check mark, in-progress = the progress mark, not-started = the plan mark, no-plan = the existing feature glyph. Marks come from the already-sanctioned Phosphor status marks; served token → presentation mapping only.
- D4 — Composition line: the second line renders per-type counts in canonical pipeline order (research · decisions · plans …) from `type_counts`, replacing every duplicated-tag second line (rail filter field, feature search suggestions). Zero-count types are omitted; the line truncates with an honest ellipsis, never wraps rows taller.
- D5 — One read: all three surfaces consume the roster query (scope-keyed, generation-invalidated as today); no surface adds a second per-feature fetch for this metadata.
- D6 — Bounds: the engine computes the fields inside the existing roster projection memoized on the graph generation; no new subprocess, no unbounded accumulation; roster response size stays capped by the existing feature ceiling.

Amendments recorded at execution (2026-08-01), from the closing review of this record's plan:

- D4 placement note - the rail Features rows are SINGLE-line by the row-density law, so those rows carry the composition in their tooltip rather than on a second line; the two surfaces D4 names by name (rail filter field, feature search suggestions) render the line itself. D4 is met as written; the tooltip placement is recorded here so a later reader does not read the rows as unmet.
- Scope note - the delivering commit also folds `docGroupMessage`/`docTypeCategory` in `vaultRowPresentation.ts` onto the canonical `docTypeVocabulary` home. That consolidation belongs to the concurrent deduplication lane, not to this record; it rode along because it touches the same rail presentation module. Its one user-visible effect is the unknown-doc-type group header falling back to "Document" instead of "Documents". Recorded rather than left silent.

## Implementation

Engine: extend the roster projection (engine-query features) with the three fields computed from the linkage graph's docs and plan interiors, memoized on generation. Stores: widen the tolerant adapter + roster view. Frontend: feature row primitive renders mark/date-range/composition from served tokens; rail Features section, FeatureSearchField suggestions, and RailFilterField second line adopt it; desk specimens author the new fields across all four states. Tests per layer, including the rollup truth table engine-side.

## Rationale

One additive widening of the read all three surfaces already share delivers everything the notes ask, keeps every displayed value engine-computed, and resolves the delegated range-semantics question with the owner's own named candidate rather than leaving it open.

## Consequences

- Feature rows answer status, age, and composition at a glance; the duplicated second line disappears everywhere at once.
- `FeatureRosterEntry` widens (additive) — one reviewed contract event; older engines absent the fields degrade honestly (marks and lines simply omit).
- The roster projection does more work per generation; memoization keeps it a build-time cost, and the truth-table test pins the rollup semantics.
- The rail gains its first date display; if the owner later wants a different range meaning, that is a supersession of D2, not a quiet remap.
