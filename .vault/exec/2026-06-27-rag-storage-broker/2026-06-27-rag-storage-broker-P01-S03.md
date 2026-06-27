---
tags:
  - '#exec'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S03'
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
     The S03 and 2026-06-27-rag-storage-broker-plan placeholders are machine-filled by
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
     The Implement storage_args_for assembling the validated argv per verb (prefix for delete, active-cell root and to-backend enum for migrate, the dry-run or yes flag from apply) and ## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Implement storage_args_for assembling the validated argv per verb (prefix for delete, active-cell root and to-backend enum for migrate, the dry-run or yes flag from apply)

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added the `RagStorageBody` request struct (`prefix`, `to`, `apply` - all optional) and `storage_args_for`: assembles the validated argv per verb (validated prefix for delete; the engine-controlled active-cell root + `server|local` enum for migrate; prune takes no positional), then always appends `--yes` and adds `--dry-run` unless `apply: true`.
- Discovered and encoded rag's real flag contract: `--json` mode REQUIRES `--yes` (it means non-interactive; `_require_yes_for_json` exits 2 otherwise), so `--yes` is always passed and `--dry-run` is the preview switch - NOT the ADR's first guess of toggling `--yes`.

## Outcome

The destructive argv is assembled with validated, engine-controlled arguments and the correct dry-run-default flag combination; `--allow-unknown` is never assembled.

## Notes

The ADR D3 mechanism note was corrected during execution: preview = `--yes --dry-run`, apply = `--yes` (the runner appends `--json`), because rag's `--json` mandates `--yes`.
