---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S18'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-timeline with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S18 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add the LineageArc wire type carrying stable id, src, dst, relation, derivation, tier, and confidence and ## Scope

- `frontend/src/stores/server/engine.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the LineageArc wire type carrying stable id, src, dst, relation, derivation, tier, and confidence

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

- Add the `LineageArc` wire type carrying the stable edge id, src, dst, relation, optional `derivation`, tier, and confidence.
- Make `derivation` optional, present only when the node-semantics field ships (the engine emits no `derivation` until then, the ADR's one real dependency).
- Constrain `tier` to the four canonical tier names; `confidence` is a number (engine f32).

## Outcome

`LineageArc` is exported from `engine.ts`. The optional `derivation` is the graceful-fallback seam: the surface draws real structural/declared/temporal lineage from day one and gains the richer label when the field lands.

## Notes

Arc identity rides the engine stable edge id (provenance-stable-keys-are-identity-bearing); the client never re-mints it.
