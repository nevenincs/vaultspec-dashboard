---
tags:
  - '#exec'
  - '#mobile-enrichment'
date: '2026-07-09'
modified: '2026-07-09'
step_id: 'S09'
related:
  - "[[2026-07-08-mobile-enrichment-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace mobile-enrichment with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S09 and 2026-07-08-mobile-enrichment-plan placeholders are machine-filled by
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
     The D8: desktop LeftRail tree-level indent guide added to the Figma design (SectionBody), matching the shipped code and the mobile Browse frame — Figma-only, no code change and ## Scope

- `figma:SlhonORmySdoSMTQgDWw3w` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# D8: desktop LeftRail tree-level indent guide added to the Figma design (SectionBody), matching the shipped code and the mobile Browse frame — Figma-only, no code change

## Scope

- `figma:SlhonORmySdoSMTQgDWw3w`

## Description

- Add the tree-level indent-guide hairline (bound to the rule color variable, no raw hex) to the `_LeftRail/SectionBody` component's healthy state in the binding Figma file, so every desktop `LeftRail` instance (AppShell, the Left Rail surface) inherits it.

## Outcome

The desktop `LeftRail` design frames now render the tree-level guide on expanded doc groups, matching the shipped frontend (`TreeBrowser` `data-tree-guide`/`guideStyle`) and the mobile Browse frame. Figma-only; the code was already correct, so there is no code change.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
