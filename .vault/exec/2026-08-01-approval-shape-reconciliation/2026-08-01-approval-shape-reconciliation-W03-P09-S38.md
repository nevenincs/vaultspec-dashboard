---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:f5552bf39384967ab2f9648e106a75533493e3260d053e4a48744305d8e7b1f2'
step_id: 'S38'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Trace whether a mutating tool call can reach the Claude family auto approve first option branch under autonomy and record the reachability finding as a durable comment, changing no behaviour

## Scope

- `src/vaultspec_a2a/providers/_acp_rpc_handlers.py`

## Description

- Traced the actual reachability question. The plan's named scope file, `lane_admission.py`, does not contain the auto-approve-first-option logic at all; it governs a different concern (per-provider web/turn admission proof). The real logic lives in `providers/_acp_rpc_handlers.py`'s `on_request_permission`.
- Traced the wiring: under autonomy, `graph/nodes/worker.py`'s `_resolve_effective_worker_model` leaves the model's `permission_callback` unset (it only wires `_interrupt_permission_callback` when NOT autonomous). For any `acp_family` other than `"kimi"`, `on_request_permission`'s final `else` branch then fires unconditionally, auto-approving the FIRST offered option (`_option_id_at(options, 0, default="allow_once")`) with no tool-name/kind allowlist — unlike `_kimi_autonomous_option_id`'s exact-name enforcement.
- Confirmed a mutating tool call reaches this branch: `on_request_permission` fires only for a tool NOT already covered by `config.allowed_tools` (the CLI's own static pre-approval), so an uncovered mutating call (write/edit/bash) is auto-approved here exactly like a read.
- Recorded the finding as a durable comment at the branch itself. Changed no behaviour — verify-and-report only, per D7's explicitly undecided item.

## Outcome

The reachability question the ADR left open is answered: YES, a Claude-family (or any non-Kimi) lane under autonomy auto-approves the first offered option for a mutating tool call with no allowlist check, an asymmetry against Kimi's exact-name enforcement. Whether to close it is its own future decision, not this one.

## Notes

Plan-locator discrepancy: this Step's scope in the plan document names `providers/lane_admission.py`, but that file has no auto-approve/allowlist logic. The actual site is `providers/_acp_rpc_handlers.py` (confirmed via `vaultspec-rag` search plus a direct read of both files). Per the dispatching brief's own instruction ("the code wins — STOP and report"), reported this as a locator error rather than a decision-altering contradiction: the Step's INTENT (trace the reachability question) was unambiguous and fully achievable, only the named file was wrong, so the finding was placed at the correct site rather than blocking the Wave.
