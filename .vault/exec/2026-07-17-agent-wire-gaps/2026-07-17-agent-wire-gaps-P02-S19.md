---
tags:
  - '#exec'
  - '#agent-wire-gaps'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S19'
related:
  - "[[2026-07-17-agent-wire-gaps-plan]]"
---

# Write tests covering the raise-order capped/truncation-marked list with pending entries flagged, the typed decision round-tripping the permission-decision write, a legacy opaque decision serving decision_unreadable without failing the page, and a live-test recovery case: a client that drops the /execute awaiting_permission response recovers the pending interrupt from the list

## Scope

- `engine/crates/vaultspec-api/src/authoring/interrupts.rs`
- `engine/crates/vaultspec-api/src/authoring/http/tests/group3.rs`

## Description

Every named scenario is covered by an existing, currently-passing test:

- `list_page_caps_and_marks_truncation` — raise-order capped/truncation-marked
  list.
- `list_page_projects_typed_decision_and_flags_pending_entries` — typed decision
  round-tripping the permission-decision write, with pending entries flagged.
- `list_page_degrades_a_legacy_opaque_decision_without_failing` — a legacy opaque
  decision serves `decision_unreadable` without failing the page.
- `run_interrupt_listing_recovers_pending_and_serves_typed_decisions`
  (`http::tests::group3`) — the live-test recovery case: a client that dropped the
  `/execute` `awaiting_permission` response recovers its pending interrupt from the
  list route.

## Outcome

All four named scenarios are proven live; this closes the P02 D3 test-coverage
gate ahead of its lint (`S20`) and review (`S21`) rows.

## Notes

Landed at commit `169ecd4aa0` ("bounded interrupt list page + typed decision
projection; changeset run/turn provenance, wire-gaps P02/P03 core, S15/S16/S22")
for the unit tests, and `9f67b2af07` ("live route coverage for interrupt-list
recovery + mode read round-trip, wire-gaps S26, D3/D5") for the live-test recovery
case. This record was authored during a fill pass reconciling the engine review's
persisted verdict (`.vault/audit/2026-07-17-a2a-orchestration-edge-audit.md`,
appended `62cf6b4573` — "engine-side scopes: PASS / PASS", citing Scope A as
agent-wire-gaps P02/P03 with zero required revisions), no code changes by me.

Independently reverified against HEAD, not the review report alone: live rerun of
`cargo test -p vaultspec-api --lib -- authoring::interrupts` — 14/14 passed, and
`authoring::http::tests::group3` — 12/12 passed, including all four named tests;
full lib suite `cargo test -p vaultspec-api --lib` — 831/831 passed. Noted: three
`cargo clippy --all-targets` warnings currently exist in
`group3.rs` (`needless_borrows_for_generic_args`), but traced by diff to
UNCOMMITTED, in-progress edits by another lane (adding a real-run authorization
floor to this same test function) — not present in the committed `S19`/`S26` test
content itself, so not attributed to this step.
