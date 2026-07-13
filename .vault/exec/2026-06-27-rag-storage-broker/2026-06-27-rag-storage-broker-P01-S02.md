---
tags:
  - '#exec'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-07-12'
step_id: 'S02'
related:
  - "[[2026-06-27-rag-storage-broker-plan]]"
---

# Add a validate_namespace_prefix guard rejecting any value that is not rag's canonical r-hash prefix

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added `validate_namespace_prefix` (beside the git `validate_*` guards): accepts only rag's canonical `r{12-lowercase-hex}_` (length 14, leading `r`, trailing `_`, 12 lowercase-hex middle), rejecting uppercase hex, wrong length, non-hex, a `-`-prefixed flag, and shell metacharacters with a 400.

## Outcome

The destructive `delete` target is confined to a real namespace shape and the flag-injection vector is closed before any subprocess.

## Notes

Uses `matches!(c, '0'..='9' | 'a'..='f')` to require lowercase hex (rag emits `{b:02x}`), not `is_ascii_hexdigit` which would admit uppercase.
