---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S07'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace frontend-localization with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S07 and 2026-07-14-frontend-localization-plan placeholders are machine-filled by
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
     The Prove runtime initialization, descriptor resolution, formatting, missing-key safety, and locale reactivity with production resources and ## Scope

- `frontend/src/platform/localization/*.test.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Prove runtime initialization, descriptor resolution, formatting, missing-key safety, and locale reactivity with production resources

## Scope

- `frontend/src/platform/localization/*.test.tsx`

## Description

- Prove synchronous initialization and resource isolation with real runtime instances.
- Exercise bounded descriptor normalization, interpolation, and safe fallback behavior.
- Verify every locale-explicit formatter and its invalid-input boundaries.
- Render the production provider and prove first-render and language-change behavior.
- Verify document language, direction, reactivity, reference counting, and cleanup.
- Exercise resource lifecycle isolation, hostile inputs, catalog nesting, and
  translation-like user values.

## Outcome

The localization substrate now has direct real-behavior coverage for its runtime,
descriptors, fallback boundary, formatters, React integration, and document metadata.
Visible fallback samples reject raw keys, unresolved interpolation, em dashes, and
implementation vocabulary. React reactivity uses a normally initialized real test
runtime without changing production singleton state or configuration.

## Notes

The three targeted suites passed with 16 tests. The full frontend lint gate and
TypeScript build check also passed.
