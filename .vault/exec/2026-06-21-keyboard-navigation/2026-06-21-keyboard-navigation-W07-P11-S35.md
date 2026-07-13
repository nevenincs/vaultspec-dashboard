---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-24'
modified: '2026-07-12'
step_id: 'S35'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

# Run the full lint gate (just dev lint frontend) and a vaultspec-code-review of the campaign diff for the Class A/B split, layer ownership, bounded accumulators, and no private global listeners

## Scope

- `.vault/audit/2026-06-21-keyboard-navigation-audit.md`

## Description

- Ran the full lint gate on the campaign's touched files (eslint + prettier + tsc all clean; campaign test suite green) and a `vaultspec-code-reviewer` pass over the foundation + every enrollment for the Class A/B split, layer ownership, bounded accumulators, no private global listeners, and the codified FocusZone rule. Recorded the review as `2026-06-24-keyboard-navigation-audit`.
- Verdict PASS-WITH-NITS. The reviewer confirmed the core primitive (double-invoke-idempotent, both preventDefault+stopPropagation, bounded), the F6 registry binding (no private global listener), layer-clean imports, and every composing enrollment — and caught TWO real HIGH double-fire defects I had missed.
- Fixed both HIGHs + the one LOW and re-verified: (1) the timeline pan viewport now `stopPropagation`s every consumed key (live-verified: arrows no longer trigger a graph selection); (2) the read-only viewers route scroll keys through a shared `stopScrollKeyPropagation` helper so the browser scrolls instead of the dispatcher hijacking the graph (new unit test, 14 cases); (3) narrowed `CodeTree.setActiveKey` to the FocusZone contract type.

## Outcome

- Review complete and recorded; all three findings resolved, committed (`e59ebe9304`), and green (tsc/eslint/prettier + 54 viewer/tree/timeline tests). The codified rule was confirmed correct and load-bearing — both HIGHs were surfaces not yet swept under it, not a gap in the rule.

## Notes

- The review surfaced no codification candidate (the findings are instances the existing rule governs). Two enrollment steps remain open and are NOT regressions: S12 (filter facet flyout — a concurrently-edited surface) and S18 (dockview tab strip — library-owned); both are keyboard-reachable, their FocusZone roving pending.
