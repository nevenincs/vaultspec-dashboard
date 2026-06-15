---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S13'
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
     The S13 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Amend the contract reference section five with the chosen lineage wire shape and ## Scope

- `.vault/reference/2026-06-12-dashboard-foundation-reference.md` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Amend the contract reference section five with the chosen lineage wire shape

## Scope

- `.vault/reference/2026-06-12-dashboard-foundation-reference.md`

## Description

- Amend contract reference section five with the chosen lineage wire shape: the `GET /graph/lineage?scope&from&to&filter=` endpoint, the `{nodes[], arcs[], truncated?}` response, the dated-node and arc field sets, the derivation graceful-fallback note, the document-node-ceiling bound, the self-consistency invariant, and the present-only-semantic tiers behavior on success and error.
- Keep the section five style and voice (the existing bullet/sub-bullet amendment idiom); leave every other section untouched.

## Outcome

Section five now names the lineage endpoint, params, response, bounded/self-consistent semantics, and the tiers-on-both-envelopes contract, consistent with the W01.P02 implementation.

## Notes

Body-prose edit of a reference document (permitted). The amendment is marked with the dashboard-timeline ADR / W01.P02 provenance the way the prior section-five amendments are dated and attributed.
