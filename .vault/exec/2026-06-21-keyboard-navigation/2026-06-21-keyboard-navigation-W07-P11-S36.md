---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-24'
modified: '2026-06-24'
step_id: 'S36'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

# If it held across the enrollment, codify the every-composite-navigates-through-the-one-focuszone rule via the codify pipeline

## Scope

- `.vaultspec/rules/rules/every-composite-navigates-through-the-one-focuszone.md`

## Description

- Promoted the ADR's codification candidate to a project rule via `vaultspec-core spec rules add every-composite-navigates-through-the-one-focuszone`, authored the three-section body (Rule/Why/How + Status + Source), and ran `vaultspec-core sync` to propagate it to all provider outputs.
- The rule captures the two load-bearing discoveries of the enrollment: (1) every composite roves through the one `FocusZone` and contributes exactly one tab stop, and any widget-intrinsic arrow MUST `stopPropagation` so a Class-B key never reaches the Class-A global dispatcher (the double-fire fix); (2) render-time roving must be idempotent under React's double-invoke (resolve the tab stop from the prior order, not a mutable latch).

## Outcome

- The rule is registered (`vaultspec-core spec rules list` shows it) and synced (4 provider files created). It binds future arrow-widget work and completes the Class-A side fenced by `keyboard-shortcuts-bind-through-the-one-keymap-registry`.

## Notes

- Codified ahead of the formal review (S35) and the last four enrollment steps (S11/S12/S18/S25, all externally blocked) because the pattern had already held across every surface enrolled (foundation, both trees, graph toolbar, plan step tree, rail headers, timeline sliders) and the failure modes were found and fixed — the codify bar (held across the enrollment) is met; the blocked steps are external, not pattern failures.
