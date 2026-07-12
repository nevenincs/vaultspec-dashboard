---
tags:
  - '#exec'
  - '#on-demand-cold-start'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S06'
related:
  - "[[2026-07-12-on-demand-cold-start-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace on-demand-cold-start with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S06 and 2026-07-12-on-demand-cold-start-plan placeholders are machine-filled by
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
     The Benchmark the actual mobile cold load (bundle census + network + paint timings): production build chunk sizes and a Playwright mobile-viewport census of scripts, API, fonts, and first-paint and ## Scope

- `scratchpad bench + dist stats` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Benchmark the actual mobile cold load (bundle census + network + paint timings): production build chunk sizes and a Playwright mobile-viewport census of scripts, API, fonts, and first-paint

## Scope

- `scratchpad bench + dist stats`

## Description

Benchmark the real mobile cold load: production build census + Playwright mobile-viewport network/paint capture.

## Outcome

MEASURED (mobile 420px, dev serve + prod build): the mobile whale is JAVASCRIPT, not data - prod eager JS was 9.7MB raw / 1.85MB gzip with one 8,645KB vendor monolith; API total only ~761KB (vault-tree, already progressive); fonts 113KB. First contentful paint ~1.2s on localhost, gated entirely on bundle parse. Root cause of the monolith: the manualChunks catch-all pinned shiki's DYNAMICALLY-imported per-grammar modules into the eager vendor chunk. three.js (505KB) also eager, and leaks through sceneController -> cameraCore -> three into widely-imported scene modules, so deferring it needs a scene-layer decoupling (follow-up, a reviewed contract event).

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
