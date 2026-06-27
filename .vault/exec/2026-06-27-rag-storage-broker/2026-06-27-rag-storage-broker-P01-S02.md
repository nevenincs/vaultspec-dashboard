---
tags:
  - '#exec'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S02'
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
     The S02 and 2026-06-27-rag-storage-broker-plan placeholders are machine-filled by
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
     The Add a validate_namespace_prefix guard rejecting any value that is not rag's canonical r-hash prefix and ## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add a validate_namespace_prefix guard rejecting any value that is not rag's canonical r-hash prefix

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added `validate_namespace_prefix` (beside the git `validate_*` guards): accepts only rag's canonical `r{12-lowercase-hex}_` (length 14, leading `r`, trailing `_`, 12 lowercase-hex middle), rejecting uppercase hex, wrong length, non-hex, a `-`-prefixed flag, and shell metacharacters with a 400.

## Outcome

The destructive `delete` target is confined to a real namespace shape and the flag-injection vector is closed before any subprocess.

## Notes

Uses `matches!(c, '0'..='9' | 'a'..='f')` to require lowercase hex (rag emits `{b:02x}`), not `is_ascii_hexdigit` which would admit uppercase.
