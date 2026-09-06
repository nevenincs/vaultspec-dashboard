---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:c403cca8903aac5b3877c891b8fb49bc0e4afccc34d132e1deeb6b69db223644'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
  - "[[2026-09-05-design-system-consolidation-adr]]"
  - "[[2026-09-05-design-system-consolidation-horizontal-polish-research]]"
  - "[[2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference]]"
---
# `design-system-consolidation` audit: `S169 graph and renderer seam classification review`

## Scope

Reviewed exact Step `W01.P01.S169`: the 16 new native-control identities in the consolidation ledger, their stable source keys, element and disposition counts, canonical owners, and rationale specificity. The review compared each entry with the live graph, island, timeline-range, tree-row, and Markdown renderer contracts; challenged the five migrations against `Button` and `IconButton`; and checked the `S170` boundary for `TimeTravelChip`, `WorktreePicker`, `ProjectNavigator`, and the two ordinary `MarkdownReader` actions.

Independent syntax-aware evidence reproduced the global executable JSX baseline of 125 sites (`button` 100, `input` 19, `select` 1, `textarea` 5). The ledger imports as 70 entries with 70 unique collision-safe source keys. The exact S169 slice is 16 entries: 15 buttons plus one input, divided into 11 `retain-semantic-seam` and five `migrate` dispositions. The ten target modules contain 18 native sites; the only two not classified in S169 are the ordinary code-copy and orphaned-notes actions in `MarkdownReader`, correctly reserved for S170. Focused exclusion checks found no current entries for `TimeTravelChip`, `WorktreePicker`, or `ProjectNavigator`. `git diff --check` passed for the ledger, and the independent full `just lint frontend` gate exited 0, including ESLint, localization, px, domain, module-size, Prettier, typecheck, token-drift, and Figma-name checks.

## Findings

### s169-classification-clean | low | The bounded composite-seam classification passes review

All 16 identities resolve to live executable JSX sites and are uniquely keyed by stable module, owner, and semantic slot. The four `CategoryLegend` controls share one roving graph-toolbar contract; `FoldableCategory` binds disclosure state to its generated panel body; `FeatureLifecycle` and `PlanInterior` are structural graph-island navigation tiles; and the three tree rows coordinate recursive disclosure, selection, roving focus, context menus, and surface-specific navigation. Their feature-surface or shared-chrome ownership is concrete and is not behaviorally equivalent to a kit text or icon action.

The `COMPONENTS.input` fallback is also correctly retained: renderer coordination replaces checkbox inputs with `StepCheckMark` while preserving unknown non-checkbox input types as read-only rendered output. Mapping that fallback to an editable field primitive would change its contract. Conversely, `GraphSettingsPanel` reset, `WorkingSet` collapse and clear, `Island` close, and `TimelineRange` clear each expose an ordinary labeled click action while keeping graph, island, or timeline state in the caller, so the declared `Button` or `IconButton` owners are justified. The rationales name the retained behavior, replacement boundary, and native chrome deleted after migration.

The boundary is faithful: `TimeTravelChip` explicitly declares itself stage chrome rather than a timeline element, and the remaining picker, navigator, and ordinary Markdown viewer actions stay unclassified for S170. No S170 family was pulled into this step.

## Recommendations

- Preserve the recorded caller-owned graph, island, and timeline commands when the five migration entries are implemented; only their interaction chrome should move to the kit.
- Keep the composite controls native within their recorded canonical owners unless a later ADR defines a reusable primitive with the full roving, tree, renderer, or structural-tile contract.
- In S170, classify the explicitly deferred stage-chip, picker, navigator, and ordinary Markdown actions; in S171, enforce the complete 125-site baseline and source-key uniqueness mechanically.

Status: PASS.
