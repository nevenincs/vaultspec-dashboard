---
tags:
  - '#exec'
  - '#rag-affordance-adoption'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S05'
related:
  - "[[2026-06-27-rag-affordance-adoption-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace rag-affordance-adoption with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S05 and 2026-06-27-rag-affordance-adoption-plan placeholders are machine-filled by
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
     The Parse rag's structured failure envelope on a genuine non-zero exit and surface the stated reason, degrading to the re-probe otherwise and ## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Parse rag's structured failure envelope on a genuine non-zero exit and surface the stated reason, degrading to the re-probe otherwise

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added `rag_start_failure` (parses rag's `{ok:false, error, data}` start envelope, returning the stated error + data) and wired it into the genuine-failure branch of `start_rag_service`: when present, the degraded envelope carries `rag_error` (e.g. `machine_owned`/`port_in_use`/`qdrant_missing`) and `rag_data` (e.g. the holder pid, the port) alongside the existing inferred `reason`.

## Outcome

A start failure surfaces rag's AUTHORITATIVE cause when the running rag supports `--json`, additively (the existing `needs_install` heuristic + inferred reason are unchanged); a non-envelope output degrades to today's inference.

## Notes

Surfaced as additive `rag_error`/`rag_data` fields rather than overriding the engine's own `status` vocabulary, to avoid conflating with the attach/`machine_owned` branch.
