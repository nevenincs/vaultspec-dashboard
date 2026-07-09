---
tags:
  - '#exec'
  - '#mobile-enrichment'
date: '2026-07-09'
modified: '2026-07-09'
step_id: 'S04'
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
     The S04 and 2026-07-08-mobile-enrichment-plan placeholders are machine-filled by
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
     The D4: edge-swipe back gesture in the compact reader (widget-intrinsic) routing the same doc-scoped unsaved-draft guard as tap-back and ## Scope

- `frontend/src/app/shell/CompactDocReader.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# D4: edge-swipe back gesture in the compact reader (widget-intrinsic) routing the same doc-scoped unsaved-draft guard as tap-back

## Scope

- `frontend/src/app/shell/CompactDocReader.tsx`

## Description

- Add `useEdgeSwipeBack` inside `CompactDocReader`: a leading-edge start band, a vertical-scroll-intent yield, and a commit threshold, applied to both reader panes.
- Route both tap-back and the swipe through `guardUnsavedDiscardForDoc` so a dirty draft for this document arms the discard confirm before the reader pops.

## Outcome

An edge-swipe pops the reader with the SAME guarded close as the tap-back control. Touch/pen only; a mouse keeps the tap control.

## Notes

Real-device verification (iOS system-back-gesture + scroll-intent interplay) is pending — the jsdom suite cannot exercise a pointer gesture; recorded as an ADR D4 consequence.

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
