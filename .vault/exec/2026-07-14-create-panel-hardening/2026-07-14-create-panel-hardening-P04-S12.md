---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S12'
related:
  - "[[2026-07-14-create-panel-hardening-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace create-panel-hardening with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S12 and 2026-07-14-create-panel-hardening-plan placeholders are machine-filled by
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
     The Add a corpus-fed add-link affordance to the Linked documents row so removed links are keyboard-recoverable, reusing the shared combobox over the linking corpus and ## Scope

- `frontend/src/app/left/CreateDocDialog.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add a corpus-fed add-link affordance to the Linked documents row so removed links are keyboard-recoverable, reusing the shared combobox over the linking corpus

## Scope

- `frontend/src/app/left/CreateDocDialog.tsx`

## Description

- Add the corpus-fed add-link affordance to the Linked documents section (now always rendered): the shared combobox over the same linking corpus the editor's Related picker reads, committing a stem back through the bounded store setter (dedupe + 16-cap).

## Outcome

Removed links are keyboard-recoverable; locked by a live-engine remove-then-re-add test over the fixture corpus.

## Notes

Free text is disallowed (Related links only to existing documents, matching the editor's picker); an empty corpus degrades to the honest empty label.
