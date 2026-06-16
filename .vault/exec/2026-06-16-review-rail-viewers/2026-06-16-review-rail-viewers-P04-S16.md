---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S16'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace review-rail-viewers with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S16 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Add react-markdown, remark-gfm, and frontmatter handling to the frontend dependencies and ## Scope

- `frontend/package.json` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add react-markdown, remark-gfm, and frontmatter handling to the frontend dependencies

## Scope

- `frontend/package.json`

## Description

- Add react-markdown and remark-gfm as runtime dependencies (installed alongside shiki in P03.S12); frontmatter is handled by a small focused parser in the FrontmatterHeader rather than a new YAML dependency, since the vault frontmatter shape is fixed and simple.

## Outcome

The markdown stack is present in runtime deps, rag/torch-free.

## Notes

The ADR listed remark-frontmatter as one option; a dedicated parser was chosen instead to render frontmatter as structured chrome without a YAML library, matching the ADR's "structured header component, not raw YAML" intent.
