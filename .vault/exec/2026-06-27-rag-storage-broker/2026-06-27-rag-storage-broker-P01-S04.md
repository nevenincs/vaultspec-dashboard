---
tags:
  - '#exec'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S04'
related:
  - "[[2026-06-27-rag-storage-broker-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace rag-storage-broker with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S04 and 2026-06-27-rag-storage-broker-plan placeholders are machine-filled by
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
     The Implement a storage-aware bounded runner that forwards the rag ok-and-command envelope verbatim on a non-zero preview exit and 502s only a genuine fault and ## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Implement a storage-aware bounded runner that forwards the rag ok-and-command envelope verbatim on a non-zero preview exit and 502s only a genuine fault

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added `run_storage_sibling_bounded` (modeled on the write runner's spawn-bounds-kill lifecycle, no stdin, appends `--json`, 120s/8 MiB) and the pure helpers `is_rag_envelope` (top-level `ok` bool + `command` string) and `storage_outcome` (forward the envelope on any exit, 502 only an unparseable/empty stdout with a non-zero exit).
- Keyed the exit-1 forward on rag's `{ok, command}` envelope shape rather than the write runner's top-level `status` (rag's storage envelope nests `status` under `data`).

## Outcome

A `would_remove` preview (which exits 1) forwards verbatim as a business outcome instead of the lifecycle runner's 502 flattening (the original audit's C1); only a genuine spawn/timeout/crash degrades to a gateway error.

## Notes

The outcome decision was extracted into the pure `storage_outcome` so the load-bearing exit-1 logic is unit-tested without a cross-platform subprocess fixture (CI runs Windows + Linux).
