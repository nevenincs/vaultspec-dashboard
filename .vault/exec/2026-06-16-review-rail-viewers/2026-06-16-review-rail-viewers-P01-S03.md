---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S03'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace review-rail-viewers with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S03 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Return {path, blob_hash, byte_len, language_hint, text, truncated} through the shared envelope with the tiers block, byte-capped with an honest truncated block and ## Scope

- `engine/crates/vaultspec-api/src/routes/content.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Return {path, blob_hash, byte_len, language_hint, text, truncated} through the shared envelope with the tiers block, byte-capped with an honest truncated block

## Scope

- `engine/crates/vaultspec-api/src/routes/content.rs`

## Description

- Return the content payload through the shared envelope helper: `path`, `blob_hash`, `byte_len`, `language_hint`, `text`, and a `truncated` block, carrying the per-scope tiers block on success.
- Byte-cap the served text with `truncate_at_char_boundary`, never splitting a UTF-8 codepoint, and emit an honest `truncated` block stating `total_bytes`, `returned_bytes`, and a reason when the file exceeds the ceiling.

## Outcome

Responses ride the shared envelope with the tiers block and an honest truncation block. The byte-cap test confirms a large file is served at exactly the cap with the full size reported.

## Notes

None.
