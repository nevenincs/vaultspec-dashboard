---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S03'
related:
  - "[[2026-07-14-rag-job-dashboard-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace rag-job-dashboard with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S03 and 2026-07-14-rag-job-dashboard-plan placeholders are machine-filled by
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
     The Design the log pane frames (monospace rows with level tones, lines selector, job-filter chip, empty and offline states) and the footer storage strip (points, footprint, tenant counts with live and orphaned split, truncation note, watcher toggle) and ## Scope

- `Figma SlhonORmySdoSMTQgDWw3w RagJobDashboard log and footer` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Design the log pane frames (monospace rows with level tones, lines selector, job-filter chip, empty and offline states) and the footer storage strip (points, footprint, tenant counts with live and orphaned split, truncation note, watcher toggle)

## Scope

- `Figma SlhonORmySdoSMTQgDWw3w RagJobDashboard log and footer`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->

## Description

- Fill the LogRegion: controls row (filter field, active "Job: reindex vault" join chip, lines selector), sunken mono well (JetBrains Mono rows with INFO/WARN/ERROR level tones via status hues), and the fetched-window honesty caption.
- Fill the FooterBar: Entries / On disk / Projects (live-stale split) stat cells, the surveyed-slice bound note, the Watcher switch, and Refresh.

## Outcome

Log and footer frames bound; plain-language labels throughout (no service-internal vocabulary).

## Notes

Mono family: JetBrains Mono available in the environment; code side uses the font-mono token stack regardless.
