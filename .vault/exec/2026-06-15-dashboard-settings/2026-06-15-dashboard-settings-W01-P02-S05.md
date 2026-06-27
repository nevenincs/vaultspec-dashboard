---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S05'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---

# Implement effective-value resolution with scoped-then-global precedence, default fallback, and per-key provenance

## Scope

- `engine/crates/vaultspec-session/src/settings.rs`

## Description

- Established effective-value resolution semantics: scoped-then-global with a schema-default fallback and per-key provenance.
- Resolution lives client-side (stores selector) consistent with the existing no-implicit-fallback store model; the engine returns the canonical value.

## Outcome

Precedence + provenance defined once and consumed by the stores selector.

## Notes
