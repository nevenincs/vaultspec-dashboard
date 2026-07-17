---
tags:
  - '#exec'
  - '#agent-wire-gaps'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S16'
related:
  - "[[2026-07-17-agent-wire-gaps-plan]]"
---

# Define the typed per-kind decision schema mirroring ToolPermissionDecisionRequest (decision: approve or deny, optional comment) and a decision_unreadable degradation marker for legacy opaque decisions

## Scope

- `engine/crates/vaultspec-api/src/authoring/interrupts`

## Description

- Add `ToolPermissionInterruptDecision` (`decision: ToolPermissionDecisionKind`, optional `comment`), the same shape as the existing `ToolPermissionDecisionRequest` write, so the resume write and the read projection speak one schema.
- Add `InterruptDecisionProjection`, a tagged enum with a `ToolPermission { decision, comment }` arm and a `DecisionUnreadable` arm for a stored decision blob that predates or does not parse as the typed schema.
- Add `project_interrupt_decision` / `project_interrupt`, parsing a resolved interrupt's stored decision through the typed schema per record, degrading to `decision_unreadable` rather than failing the whole page.
- Add unit tests for the happy path (typed approve decision with a comment round-trips) and the legacy path (an opaque pre-schema blob degrades to `decision_unreadable` while the page still serves).

## Outcome

Landed at commit `169ecd4aa0` alongside S15 and S22 in one reviewed commit. `cargo test -p vaultspec-api interrupts` — 13/13 passed, including `list_page_projects_typed_decision_and_flags_pending_entries` and `list_page_degrades_a_legacy_opaque_decision_without_failing`. `cargo fmt -p vaultspec-api -- --check` clean for this file.

## Notes

A pending interrupt carries no `decision` field at all (`Option::is_none` skip), distinct from a resolved-but-unreadable decision — verified by the test asserting `page.items[1].decision.is_none()` for the pending entry.
