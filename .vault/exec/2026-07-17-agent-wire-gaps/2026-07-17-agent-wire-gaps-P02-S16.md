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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace agent-wire-gaps with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S16 and 2026-07-17-agent-wire-gaps-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Define the typed per-kind decision schema mirroring ToolPermissionDecisionRequest (decision: approve or deny, optional comment) and a decision_unreadable degradation marker for legacy opaque decisions and ## Scope

- `engine/crates/vaultspec-api/src/authoring/interrupts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
