---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-07-12'
step_id: 'S03'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

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
