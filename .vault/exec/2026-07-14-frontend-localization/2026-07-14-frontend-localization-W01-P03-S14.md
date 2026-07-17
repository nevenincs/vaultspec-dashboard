---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S14'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Implement the bounded production-source localization scanner with narrow semantic exclusions

## Scope

- `frontend/scripts/scan-localization.mjs`
- `frontend/scripts/localization-allowlist.json`

## Description

- Parse production TypeScript and TSX with the installed compiler API without executing
  application modules.
- Detect static presentation copy, unsafe translation construction, and direct locale
  formatting through bounded syntax and constant resolution.
- Exclude only tests, declarations, generated sources, catalog owners, and the exact
  alternate-locale resource fixture.
- Seed an exact per-occurrence allowlist that rejects new and stale findings.
- Bound traversal, file sizes, constant resolution, findings, snippets, and allowlist
  input.
- Resolve translation calls through imported symbol provenance and aliased hook
  destructuring without trusting same-name local functions.
- Reject mixed translated and literal branches, generated-comment bypasses, allowlist
  metadata changes, and constant-expansion overflow.

## Outcome

The source scanner deterministically inventories 1,560 current findings while refusing
new findings and stale allowlist entries. The stored baseline contains only stable IDs,
rule codes, and relative paths. It contains no source literals or diagnostic data.

## Notes

Temporary real source fixtures exercised every finding code and were removed. Standard
lint-gate integration remains assigned to S15, and durable fixture coverage remains
assigned to S16.
Adversarial temporary sources exercised aliased bindings, unrelated same-name calls,
mixed branches, generated comments, metadata tampering, and the parts cap, then were
removed.
An aliased confirmation-descriptor fixture also proved that structured confirmation
objects are not treated as message keys while nested dynamic keys and raw presentation
fields remain findings. The fixture was removed after verification.
Composed confirmation fixtures verified static shorthand and ordered spreads, nested
dynamic keys, raw shorthand fields, cyclic composition, and field-count overflow. The
fixtures were removed after verification.
