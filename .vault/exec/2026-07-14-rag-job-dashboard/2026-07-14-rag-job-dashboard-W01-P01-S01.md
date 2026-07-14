---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S01'
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
     The S01 and 2026-07-14-rag-job-dashboard-plan placeholders are machine-filled by
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
     The Design the wide dashboard panel shell frame - header bar (identity, health word, lifecycle verbs, reindex progress) over a scrollable body over a footer bar - Kit-composed on the token scale and ## Scope

- `Figma SlhonORmySdoSMTQgDWw3w RagJobDashboard shell` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Design the wide dashboard panel shell frame - header bar (identity, health word, lifecycle verbs, reindex progress) over a scrollable body over a footer bar - Kit-composed on the token scale

## Scope

- `Figma SlhonORmySdoSMTQgDWw3w RagJobDashboard shell`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->

## Description

- Create the `RagJobDashboard` component (node 1102:4354, 720 wide) in the Control Panels host: HeaderBar (title, health dot + word, pid/port meta, close, verb row Stop/Restart/Doctor/Reindex with inline ProgressBar + progress label), body region placeholders, sunken FooterBar - all fills/strokes token-bound (chrome/*, border/subtle, status/health-*).

## Outcome

Shell frame bound and Kit-composed; verified in the composite screenshot.

## Notes

One atomic script syntax failure on first attempt (invalid object literal); retried clean - no partial nodes.
