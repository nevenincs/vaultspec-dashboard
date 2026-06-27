---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S28'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

# extend the tolerant live adapter for the new shapes

## Scope

- `frontend/src/stores/server/liveAdapters.ts`

## Description

- Added `adaptSession` and `adaptSettings` tolerant adapters plus two private
  helpers (`adaptScopeContext`, `adaptStringMap`) to the live-adapter module.
- `adaptSession` defaults every missing field to a safe empty: absent
  `scope_context` → `{ folder: null, feature_tags: [] }`, absent `recents` → `[]`,
  absent `workspace`/`active_scope` → empty string, absent `tiers` → empty block.
  A non-object body returns the fully-defaulted empty session, so a
  freshly-recreated best-effort store restores as "no selection yet" rather than
  throwing on load.
- `adaptSettings` defaults absent `global`/`scoped` to empty maps, drops
  non-string values, and tolerates a sparse-omitted scope; the client composes
  precedence over whatever is present without guarding for missing keys.
- Both run after the client's `unwrapEnvelope` step, so a live `{data, tiers}`
  body and an internal (mock) body both flow through one code path — the
  tolerance is the S49 one-code-path property carried to the new surface.

## Outcome

The session/settings surface never throws on a sparse or older shape; the chrome
never has to read the raw tiers block — degradation truth rides through on the
defaulted `tiers`. Frontend `tsc -b` and `prettier --check` are clean.

## Notes

The adapter code landed in the same change as the S25 client methods because the
client imports `adaptSession`/`adaptSettings` and could not compile without them
(the per-commit gate must stay green); this Step's record documents the adapter
contract, and the S34 parity test proves the tolerance against a captured-live
sample. No skips, no stubs.
