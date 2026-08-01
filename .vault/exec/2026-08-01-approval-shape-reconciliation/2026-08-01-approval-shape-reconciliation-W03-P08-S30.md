---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:7f2b03f3e0303c393391915e4b749a03f647c5d1423c823747b9146dfa607e89'
step_id: 'S30'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Promote the private verdict parsing helper to a public exported function so the legacy plan gate can reuse it instead of re deriving verdict parsing

## Scope

- `src/vaultspec_a2a/graph/nodes/phase_gate.py`

## Description

- Renamed `_parse_verdict` to `parse_verdict` and added it to `__all__`.
- Expanded its docstring to state it is now the one verdict-shape parser shared by the document phase gate and the legacy plan-approval node.

## Outcome

The document gate's own call site updated automatically (same-file rename); `graph/nodes/supervisor.py` can now import and reuse the same parser (S31).

## Notes

None.
