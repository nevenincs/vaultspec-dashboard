---
tags:
  - '#exec'
  - '#agent-wire-gaps'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S15'
related:
  - "[[2026-07-17-agent-wire-gaps-plan]]"
---

# Expose the existing interrupts_for_run(run_id, cap) store query for the new read route, serving raise-order results as already returned, with pending entries flagged and a truncated marker at INTERRUPT_LIST_CAP=50, rather than adding a new store query

## Scope

- `engine/crates/vaultspec-api/src/authoring/store`

## Description

- Add `INTERRUPT_LIST_CAP = 50` as the served page ceiling.
- Add `interrupts_list_page(run_id, cap)` on `InterruptRepository`, reusing the existing `interrupts_for_run` store query (no new query) by fetching one row past the clamped cap to derive an honest `truncated` marker.
- Clamp the requested `cap` to `1..=INTERRUPT_LIST_CAP` and preserve raise order.
- Add `InterruptListPage` (`items`, `cap`, `truncated`) and `InterruptProjection` (id, run, kind, tool call, resume state, decision, timestamps) as the served shapes.
- Add unit tests: cap-and-truncation across a 3-item run at cap 2 and at an over-ceiling requested cap, plus coverage folded into S16 for the pending/resolved decision split.

## Outcome

Landed at commit `169ecd4aa0` alongside S16 and S22 in one reviewed commit. `cargo test -p vaultspec-api interrupts` — 13/13 passed, including `list_page_caps_and_marks_truncation`, `list_page_projects_typed_decision_and_flags_pending_entries`, and `list_page_degrades_a_legacy_opaque_decision_without_failing`. `cargo fmt -p vaultspec-api -- --check` was clean for this file after one wrapped-signature fix.

## Notes

No route wiring in this step — this is the store-layer read only (`interrupts_list_page`); the HTTP route consuming it is separate P02 scope.
