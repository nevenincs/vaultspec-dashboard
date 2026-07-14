---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S11'
related:
  - "[[2026-07-14-feature-group-authoring-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace feature-group-authoring with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S11 and 2026-07-14-feature-group-authoring-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Remove bare exec from the offered types and pre-answer stage 1 from feature-scoped entry points (Features-section affordance, tree context menu) and ## Scope

- `frontend/src/app/left` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
