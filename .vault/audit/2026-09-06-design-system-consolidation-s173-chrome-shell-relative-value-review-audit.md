---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:3ef98a2197108f9be7f19637d2bc9086c47aa053b97e5f32efa4f4bb1b605eec'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
  - "[[2026-09-05-design-system-consolidation-adr]]"
  - "[[2026-09-05-design-system-consolidation-horizontal-polish-research]]"
  - "[[2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference]]"
---

# `design-system-consolidation` audit: `S173 chrome and shell relative-value classification review`

## Scope

Reviewed exact Step `W01.P01.S173`: the raw relative-value line-sites in shared chrome, shell, `AddProjectDialog`, and `CreateDocDialog`, plus their ledger identities, full expressions, units, dispositions, canonical owners, and rationale fields against live source and the accepted behavior-preserving consolidation decision. Later value families and unrelated dirty graph and scene work remained outside scope.

The independent raw scan reproduced exactly 106 production app/platform line-sites and 14 disjoint S173 scope line-sites. The accepted S172 prefix remains 18 entries, and the accumulated ledger imports as 32 entries with 32 unique collision-safe keys. The S173 identity count and disposition totals are the expected 12 `migrate`, one `retain-exact-geometry`, and one `repair-local-defect`; however, two of the 14 line-site entries record only one of multiple arbitrary relative expressions present on their source line.

The focused `consolidation-ledger.test.ts` suite passed three of three tests. Independent `just lint frontend` exited 0 across ESLint, localization, relative-unit, domain, module-size, formatting, typecheck, token-drift, and Figma-name checks. Green mechanics do not close the semantic omissions below because S178 has not yet added full relative-value line matching.

## Findings

### incomplete-multi-expression-lines | medium | Two counted line-sites omit co-located relative values

The `BottomSheet` `panel-viewport-height-limit` entry records only `max-h-[85vh]`, while the same counted source line also contains `pb-[max(1rem,env(safe-area-inset-bottom))]`. The `Dialog` `panel-viewport-height-limit` entry similarly records only `max-h-[80vh]`, omitting `max-w-[calc(100vw-2rem)]` from that counted line. This campaign defines the 106 baseline as line-sites, and prior reviewed entries preserve every relative expression co-located on one line. Leaving these values out makes both source expressions and `units` tuples incomplete, and conflicts with later plan steps that explicitly consume sheet safe-area and dialog width geometry.

No other identity, owner, disposition, or rationale defect surfaced. `[...related, stem]` is correctly retained as the dated raw-baseline false positive and assigned to the planned syntax-aware scanner without authorizing a production edit. `IconRail`'s selection sliver is singular exact geometry; the other planned component roles preserve their shipped values without token snapping.

### incomplete-multi-expression-lines-resolved | low | Both grouped viewport records now cover their complete source lines

Re-review confirmed the `BottomSheet` entry now records `max-h-[85vh] pb-[max(1rem,env(safe-area-inset-bottom))]`, units `vh` and `rem`, and the grouped `component.bottom-sheet.viewport-geometry` owner with exact height and safe-area rationale. The `Dialog` entry now records `max-h-[80vh] max-w-[calc(100vw-2rem)]`, units `vh`, `vw`, and `rem`, and the grouped `component.dialog.viewport-geometry` owner with exact height and compact-width rationale. No entry was added or removed.

The independent post-fix probe again produced 106 global line-sites, 18 S172 entries, 14 S173 scope line-sites, 32 accumulated entries, 14 unique S173 source keys, and no source-expression miss. Focused Vitest passed three of three tests, `git diff --check` passed for the ledger, and independent full `just lint frontend` exited 0.

## Recommendations

- Amend the existing `BottomSheet` line-site entry to include `pb-[max(1rem,env(safe-area-inset-bottom))]`, add `rem` to its units, and make its owner/rationale cover both the exact height and safe-area geometry required by the later sheet-consumption step.
- Amend the existing `Dialog` line-site entry to include `max-w-[calc(100vw-2rem)]`, add `vw` and `rem` to its units, and make its owner/rationale cover both exact viewport bounds required by the later dialog-consumption step.
- Preserve 14 S173 entries and 32 accumulated entries; these are corrections to the two existing line-site records, not additional baseline identities.
- Resolved: both existing records now carry their complete expressions, unit vocabularies, grouped canonical owners, and exact-value rationales while preserving all counts.

Status: PASS.
