---
tags:
  - '#audit'
  - '#review-surface-flow'
date: '2026-07-19'
modified: '2026-07-19'
related: []
---

# `review-surface-flow` audit: `review surface flow`

## Scope

Delivery of the accepted `review-surface-flow` ADR: F1 de-modalize the review
surface into an Agent-panel "Pending changes" view (P02), F2 relocate the autonomy
control composer-adjacent plus the pending-changes bridge (P03), over the P01
scope-level operation-mode read that the agent-wire-gaps campaign had already
delivered (verified pre-existing, not rebuilt). Each phase is reviewed and
live-driven in the assembled app per the standing lesson that a seam-mocked green
suite can hide a wire-broken feature.

## Findings

### review-surface-flow | pass | P02 de-modalization APPROVED (independent review)

Commit `b2b349a514` (F1, option B full clean eviction) passed independent code
review with no defect at LOW or above. Verified `tsc -b` exit 0 plus 61 tests over
8 files green against the live engine. The seven audited invariants all hold: the
clean cutover removes `approvals` from the modal id union entirely (no dead toggle
state, no permanently-disabled lie); the Review chip preserves its action id and
palette enrollment while re-routing to the Agent-panel pending view; store
selectors return raw state; the pending view consumes the frozen review-station
contract with no double render; localization is complete; and the migrated guards
assert the new reality against real store state (real `run()` calls, no mocks) —
the exact hole that hid the prior feature's wire break is closed here. Two
INFO-level notes: `ReviewStationSection` is now orphaned (its deletion is the
P03-scheduled clean-up), and the `panel:approvals` palette-coverage assertion moved
from `actionCoverage.guard` to the command-provider test (coverage preserved, an
optional one-line symmetry restore folded into P03).

### review-surface-flow | pass | P02 live-driven in the assembled app (A1/A2/A5)

Headless live-drive against the running SPA + engine: the footer Review chip opens
the Agent-panel pending view (`data-agent-pending-changes` inside `data-agent-panel`,
128 proposals rendered), with NO blocking modal and the editor behind staying
interactive, and NO approvals modal reachable. Screenshot persisted. Confirms the
de-modalization is real in the assembled product, not just green in tests.

### review-surface-flow | pass | P03 delivered — autonomy relocated + bridge (commit `694550e50d`)

`AgentAutonomyControl` mounts composer-adjacent in the transcript view (reads the
served scope-level mode, renders only when non-null); `PendingChangesBridge` shows a
truncation-honest out-of-session count above the composer and routes to the inbox;
the orphaned `ReviewStationSection` is deleted (clean cutover). Gate green (tsc +
`just dev lint frontend` + touched-scope vitest 13/13 + 42/42).

### review-surface-flow | pass | P03 APPROVED (independent review of `694550e50d`)

Independent review verified all four invariants: the autonomy relocation is honest
(renders composer-adjacent in the transcript view only, `null` when no mode is
observable, and renders on an empty conversation via P01's served scope-level mode);
the `derivePendingChangesBridge` derivation is a pure, directly-unit-tested,
truncation-honest function (out-of-session correlation counts no-run_id rows and
excludes in-session runs; a truncated slice degrades to a count-less "More pending
changes", never a fabricated total; nothing at zero); the `ReviewStationSection`
deletion is clean (unused imports dropped, live test re-pointed to the new host, no
shim); and store-selector / view-freeze / localization / test-integrity rules hold
(the bridge render test seeds a REAL out-of-session proposal over the live wire, not
a mock). Verified `tsc -b` exit 0 + 33 tests/4 files green. One INFO note (not a
defect): the bridge is deliberately silent in the extreme corner where every
out-of-session row is hidden beyond the page cap — a documented choice, with the
always-present footer Review chip as the unconditional route to the inbox.

### review-surface-flow | pass | FULL acceptance set live-driven (A1–A5, P04)

Assembled-app headless drive proves every ADR acceptance criterion: A1 inbox opens
inside the Agent panel with the editor still interactive and no modal scrim; A2 the
footer chip lands in the pending view; A3 the autonomy control renders
composer-adjacent in the transcript view (and on an EMPTY conversation, via the
served default mode — the case impossible before P01) and is absent from the pending
view; A4 the "N other pending changes" bridge appears for out-of-session rows and
switches views; A5 no approvals modal remains reachable. Two screenshots persisted
(transcript + pending). This is the standing lesson honored: the feature is proven
in the running product, not only in seam-level tests.

## Recommendations

- P03 deletes the orphaned `ReviewStationSection` (clean cutover) and optionally
  restores the one-line `actionCoverage.guard` symmetry for the review-inbox action.
- P04 live-drives the full acceptance set (A1–A5) including the relocated autonomy
  control and the out-of-session bridge, then records the Figma frame debt the ADR
  flags (inbox view, autonomy placement, applied-under-policy lane, stale `1089:4437`).
