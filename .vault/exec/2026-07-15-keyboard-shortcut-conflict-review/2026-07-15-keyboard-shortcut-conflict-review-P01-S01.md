---
tags:
  - '#exec'
  - '#keyboard-shortcut-conflict-review'
date: '2026-07-15'
modified: '2026-07-17'
body_hash: 'sha256:c375a1a1a1b52a139f991ef9742d1c73e3a56a6b01657d25c8a4590c96fef159'
step_id: 'S01'
related:
  - "[[2026-07-15-keyboard-shortcut-conflict-review-plan]]"
---

# Export the specificity helper and narrow findConflicts/conflictsForCandidate to equal-specificity pairs, stating the formal conflict definition in the module comment (D1)

## Scope

- `frontend/src/platform/keymap/registry.ts`

## Description

- Export specificity() from the keymap registry; add the equal-specificity isConflictPair predicate and rewire findConflicts/conflictsForCandidate through it; state the formal conflict definition in the module comment; rewrite the registry test that asserted a global-vs-canvas pair was a conflict.

## Outcome

The one scope-aware conflict definition (ADR D1) lives in production registry code; old overlap-only semantics deleted with no bridge.

## Notes
