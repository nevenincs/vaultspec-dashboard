---
tags:
  - '#audit'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
  - "[[2026-06-15-dashboard-timeline-adr]]"
---

# `dashboard-timeline` audit: `relational phase-lane timeline`

## Scope

The relational phase-lane timeline build (plan `2026-06-15-dashboard-timeline-plan`,
steps W01-W05): the engine temporal-lineage projection and its wire route, the
stores lineage layer (types, adapter, hook, mock), the rebuilt timeline surface
(scroll-strip, phase lanes, dated marks, derivation arcs, control bar, minimap,
retained transport), and the AppShell integration. Reviewed against the ADR, the
plan Verification criteria, and the project rules (layer ownership, bounded reads,
tiers-on-every-response, degradation-from-tiers, mock-mirrors-live, stable-key
identity, views-as-projections, iconography/token discipline, test integrity, and
the inherited temporal invariants). This is the W05.P11.S71 review.

## Findings

The build is, on its own merits, a disciplined and correct implementation: layer
ownership is respected throughout (no `fetch`, no raw `tiers`, no client-minted
ids, a projection over the one `LinkageGraph`); the projection is bounded,
self-consistent (edges only among kept nodes), enveloped (tiers on success and
error through the shared helper), and blob-true with semantic present-only;
degradation is read pre-derived from `useSurfaceStates().timeline`; the inherited
invariants hold (one delta clock, the timeline as the single date-range writer,
`movePlayhead` as the one mode mutation, ops-disable off the shared
`timelineMode`); chrome uses only `:root` tokens and the two sanctioned icon
families, with the 14px grayscale gate asserted and tabular numerals on dates; the
a11y and reduced-motion contract is delivered. Two HIGH findings and one LOW were
raised.

- **HIGH-1 (feature defect, fix required) - `date_bounds` mock/live divergence.**
  The live engine `/filters` serves `date_bounds` as `{ min, max }`
  (`engine-query/src/filter.rs`), but the stores `adaptFilters`
  (`frontend/src/stores/server/liveAdapters.ts`) never reads the field (its
  comment claiming the live vocabulary omits date bounds is stale), and the mock
  serves `{ from, to }`. Against the live origin `corpusBounds` is therefore
  always undefined, so the control bar's fit-all and fit-feature silently no-op
  and the minimap falls back to a wrong span. This is the exact
  passes-every-mock-test-yet-breaks-against-live failure `mock-mirrors-live-wire-shape`
  exists to prevent. Fix: map the live `{ min, max }` to the internal `{ from, to }`
  in `adaptFilters` (tolerant of both), correct the stale comment, align the mock
  to emit the live `{ min, max }` field names, and add an `adaptFilters`
  consumer-fidelity assertion mirroring the lineage fidelity test.

- **HIGH-2 (NOT a feature defect; concurrent-merge boundary) - unresolved merge
  conflict markers across the shared worktree.** At review time a concurrent
  integration merge (`nvr-p01-staging`, the node-visual-richness campaign) was
  open with unresolved conflict markers in ~14 shared files, including stores
  modules the timeline extends (`engine.ts`, `queries.ts`, `mockEngine.ts`,
  `corpus.ts`, `liveAdapters.test.ts`) and, transiently, `pipeline.rs` (since
  resolved). While the merge is open the whole tree cannot compile, so the
  timeline's Verification (full gate green; engine + route + surface tests) cannot
  be re-confirmed at that instant. This was authored green: the full gate
  `just dev lint all` exited 0 earlier in the build, before the concurrent merge
  landed. Resolution is owned by the integration campaign, not this feature; the
  timeline-feature files must not be edited mid-merge. Once the merge completes,
  re-run the full gate and the engine + timeline suites to re-confirm.

- **LOW-1 (recommended) - AppShell does not pass a measured width to the control
  bar.** `frontend/src/app/AppShell.tsx` mounts `TimelineControls` without
  `viewportWidth`, so it defaults to 800px while the surface measures its true
  width via `ResizeObserver`; the fit/zoom/jump math and minimap brush mis-size on
  a non-800px footer. Cosmetic (controls still function). Lift a measured width
  into the footer and pass it through.

## Recommendations

1. Apply HIGH-1 once the concurrent merge has cleared the conflicted stores files,
   then add the fidelity assertion and re-run the timeline vitest suite.
2. Apply LOW-1 (measured `viewportWidth` into `TimelineControls`).
3. After the integration merge resolves (HIGH-2), re-run `just dev lint all` to
   exit 0 and the engine (`engine-query`, `vaultspec-api`) + timeline test suites
   to re-confirm the plan Verification criteria, then close the plan.

Verdict: REVISE - the feature is architecturally sound and authored-green; the
required revision is HIGH-1 (small, real) plus LOW-1, both gated behind the
concurrent merge (HIGH-2) clearing.

## Resolution (2026-06-15)

The concurrent `nvr-p01-staging` merge (HIGH-2) cleared after ~8 minutes; the
timeline-feature files survived its conflict resolution intact (verified: all
lineage symbols present; engine-query 87 tests and vaultspec-api 52 tests pass
post-merge, 0 failures; frontend `tsc -b` clean).

- **HIGH-1 resolved.** `adaptFilters` now maps the live `date_bounds {min, max}`
  onto the internal `{from, to}` (tolerant of both), and the mock `/filters` now
  serves the live `{vocabulary: {... date_bounds: {min, max} ...}}` shape so it
  flows through the SAME adapter path as the live origin. Two fidelity assertions
  added (live `{min,max}` -> `{from,to}`, and absent-bounds -> undefined). The
  timeline + stores suites pass (296 of 297; the one failure is the concurrent
  dashboard-settings campaign's settings-registry test, not a timeline file).

- **LOW-1 resolved.** `TimelineControls` now measures its own rendered width via a
  `ResizeObserver` (the bar spans the same footer width as the surface it drives),
  falling back to the `viewportWidth` prop, so the fit / zoom / jump math and the
  minimap brush size to the real viewport rather than the 800px default.

Residual whole-repo gate red is entirely sibling-campaign churn in the shared
worktree, NOT timeline-feature files: the dashboard-settings campaign's
prettier-dirty `mockEngine.ts` settings-validation block and
`liveAdapters.settingsSchema.test.ts`, its `session.test.ts` registry-validation
logic failure, and a `Dialog.render.test.tsx` jest-dom typing error. Each is that
campaign's declaring-green responsibility. Every timeline-feature file passes
eslint + prettier + tsc, and the backend + timeline test suites are green. Plan
`2026-06-15-dashboard-timeline-plan` is 73/73 complete.

## Codification candidates

None. HIGH-1 is a worked instance of the existing `mock-mirrors-live-wire-shape`
rule (the mock diverged from the live `date_bounds` shape), not a new constraint -
it reinforces a codified rule rather than originating one. HIGH-2 is a transient
concurrent-merge state, not a durable lesson. LOW-1 is feature-local. The ADR's
own constraints (one delta clock, single date-range writer, bounded reads,
layer ownership, tiers-on-every-response) are each already captured by existing
rules. No new durable cross-session constraint originates here.
