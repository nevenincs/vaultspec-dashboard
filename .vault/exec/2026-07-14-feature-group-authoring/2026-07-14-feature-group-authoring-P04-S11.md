---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S11'
related:
  - "[[2026-07-14-feature-group-authoring-plan]]"
---

# Remove bare exec from the offered types and pre-answer stage 1 from feature-scoped entry points (Features-section affordance, tree context menu)

## Scope

- `frontend/src/app/left`

## Description

- Confirm bare exec left the offered types: the offered set is derived only from `deriveOfferedCreateDocTypes`, whose canonical order excludes the step-record type, so the stage-2 Document type radiogroup can never offer it (a removed non-capability, not a disabled lie). A render test asserts no step-record radio exists.
- Confirm every create entry point still dispatches the ONE shared `left-rail:new-document` descriptor via `newDocumentAction`: the feature-folder context menu and the doc-type category menu pass their feature so stage 1 opens pre-answered; the Features-section header Plus opens with the feature field focused; the workspace ghost and the browser-region Plus open blank at stage 1.

## Outcome

- The panel offers only creatable pipeline types and pre-answers stage 1 from the feature-scoped surfaces; no descriptor id was renamed and no bespoke handler was introduced (relabeling is deferred to P05).
- The sibling menu, palette, action-coverage, and new-document affordance guard tests all pass unchanged against the rebuilt panel.

## Notes

- This Step required no code change: the exec removal was realized in the P03 store rework (the offered-types constant already excludes the step-record type) and is now enforced by the panel, and the feature-scoped entry points already pass their feature through the shared descriptor. The Step is an honest confirmation that both invariants hold end to end.
- The per-document row context menu deliberately opens the panel blank: the vault-doc entity descriptor carries no feature field, and deriving a feature from the stem would be fragile (feature tags may contain hyphens). Carrying a document's feature into the descriptor would be an entity-plumbing change outside this Step's scope and is left for a future refinement if desired.
