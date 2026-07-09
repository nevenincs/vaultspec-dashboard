---
tags:
  - '#exec'
  - '#mobile-enrichment'
date: '2026-07-09'
modified: '2026-07-09'
step_id: 'S08'
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
     The S08 and 2026-07-08-mobile-enrichment-plan placeholders are machine-filled by
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
     The D7: edge-swipe hardening decided — pointer-capture rejected, touch-action pan-y shipped and ## Scope

- `real-device gap closed via a documented manual-verify checklist on the S04 record`
- `frontend/src/app/shell/CompactDocReader.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# D7: edge-swipe hardening decided — pointer-capture rejected, touch-action pan-y shipped

## Scope

- `real-device gap closed via a documented manual-verify checklist on the S04 record`
- `frontend/src/app/shell/CompactDocReader.tsx`

## Description

- Decide the edge-swipe hardening (ADR D7): REJECT `setPointerCapture` (it would starve the reader's own scroll child of pointer events); keep the shipped `touch-action: pan-y` plus the vertical-intent yield in the move handler.
- Record the real-device manual-verification checklist on the S04 execution record to formally close the gate the vitest suite cannot exercise.

## Outcome

The D4 gesture ships in its committed form; the real-device verification gap is closed for merge by a documented manual checklist (iOS Safari + Android Chrome). No code change beyond the already-shipped hardening.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
