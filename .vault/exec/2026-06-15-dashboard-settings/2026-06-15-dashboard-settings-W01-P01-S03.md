---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-07-12'
body_hash: 'sha256:c6e9ac5769c993e3745427eada691b8e41f6bebfa56eb6b1a1ea216c389678e1'
step_id: 'S03'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---

# Implement typed value encode and decode over the existing string value column with legacy-raw and absent-key default fallback

## Scope

- `engine/crates/vaultspec-session/src/settings.rs`

## Description

- Kept the wire string-valued: typed values ride the existing `settings(scope, key, value)` column as strings (bool as "true"/"false", integer as a decimal string).
- Canonical-form normalization happens in validation, so no storage migration was needed.

## Outcome

Typing is a schema concern applied on both ends; the storage table is unchanged.

## Notes
