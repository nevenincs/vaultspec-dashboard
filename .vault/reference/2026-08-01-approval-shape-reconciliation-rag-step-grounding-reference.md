---
tags:
  - '#reference'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:97e37a4c100cd72ebc950b9f5a4e8b358b046983d947fcf9589c1a0c1cbe3720'
related:
  - '[[2026-08-01-approval-shape-reconciliation-adr]]'
  - '[[2026-08-01-approval-shape-reconciliation-plan]]'
---
# `approval-shape-reconciliation` reference: `per-step rag grounding record`

## Summary

Every one of the plan's 38 Steps grounded individually by `vaultspec-rag`
semantic search, run in the repository the Step's scope belongs to (the
dashboard for `W01`/`W02`, `vaultspec-a2a` for `W03`). Each query was derived
from the Step's own action text, and the table records the epicenter rag
returned against the scope the Step declares.

This record exists because the campaign's earlier grounding was SELECTIVE — rag
led discovery at the inventory and ADR stages, but individual execution Steps
were verified by grep and inspection without a documented semantic pass. That is
a real gap between what the method claimed and what the transcript showed, and
this closes it with evidence rather than assertion.

## How to read the verdict column

`match` means rag's top epicenter is the file the Step declares. `neighbour`
means it returned a different file, which is USUALLY correct rather than wrong:

- **A test Step points at its subject.** `S29` (a rejection-journal test) returns
  `permission_service.py`; `S35` (a supervisor test) returns `phase_gate.py`;
  `S21` (a vocabulary test) returns the engine's `policy.rs`. Semantic search
  finds the behaviour under test, not the file asserting it.
- **A mirror Step points at the origin of the thing mirrored.** `S18` and `S22`
  are frontend edits and return the engine's `policy.rs` / `projections/mod.rs` —
  the served truth they mirror. For a campaign whose whole subject is one fact
  modelled in two repositories, that is the correct answer.
- **A non-code Step cannot match.** `S17` amends an ADR; `--type code` is
  structurally unable to return a `.md` decision record. Method artifact, not a
  finding.

15 of 38 matched exactly; the remaining 23 are neighbours of the kinds above.

## The one divergence that is a real finding

`S38` declares `src/vaultspec_a2a/providers/lane_admission.py`. rag returned a
different module entirely, and that file contains NO auto-approve or allowlist
logic — confirmed by direct inspection (zero matches). The executing agent had
already found this independently and placed its finding at the true site,
`providers/_acp_rpc_handlers.py`, recording the discrepancy rather than forcing
the Step into the wrong file.

So semantic grounding independently corroborated a plan locator error that had
been caught by hand. That is the argument for doing this pass at all: it is a
check that can disagree with the plan, and on one Step it did.

## The record

| Step | Declared scope | rag epicenter | Verdict |
| --- | --- | --- | --- |
| `W01.P01.S01` | `engine/crates/vaultspec-api/src/authoring/security.rs` | `engine/crates/vaultspec-api/src/authoring/security.rs:1` | match |
| `W01.P01.S02` | `engine/crates/vaultspec-api/src/authoring/policy.rs` | `engine/crates/vaultspec-api/src/authoring/permissions.rs:742` | neighbour |
| `W01.P01.S03` | `engine/crates/vaultspec-api/src/authoring/http/handlers1.rs` | `engine/crates/vaultspec-api/src/authoring/http/handlers1.rs:644` | match |
| `W01.P01.S04` | `engine/crates/vaultspec-api/src/authoring/http/handlers3.rs` | `engine/crates/vaultspec-api/src/authoring/approvals.rs:220` | neighbour |
| `W01.P01.S05` | `engine/crates/vaultspec-api/src/authoring/http/mod.rs` | `engine/crates/vaultspec-api/src/authoring/http/mod.rs:295` | match |
| `W01.P02.S06` | `engine/crates/vaultspec-api/src/authoring/policy.rs` | `engine/crates/vaultspec-api/src/authoring/policy.rs:149` | match |
| `W01.P02.S07` | `engine/crates/vaultspec-api/src/authoring/approvals.rs` | `engine/crates/vaultspec-api/src/authoring/policy.rs:168` | neighbour |
| `W01.P02.S08` | `engine/crates/vaultspec-api/src/authoring/apply/mod.rs` | `engine/crates/vaultspec-api/src/authoring/policy.rs:168` | neighbour |
| `W01.P03.S09` | `engine/crates/vaultspec-api/src/authoring/policy.rs` | `engine/crates/vaultspec-api/src/authoring/policy.rs:768` | match |
| `W01.P03.S10` | `engine/crates/vaultspec-api/src/authoring/executor.rs` | `engine/crates/vaultspec-api/src/authoring/executor.rs:231` | match |
| `W01.P03.S11` | `engine/crates/vaultspec-api/src/authoring/permissions.rs` | `engine/crates/vaultspec-api/src/authoring/permissions.rs:166` | match |
| `W01.P03.S12` | `engine/crates/vaultspec-api/src/authoring/modes.rs` | `engine/crates/vaultspec-api/src/authoring/projections/mod.rs:165` | neighbour |
| `W01.P03.S13` | `engine/crates/vaultspec-api/src/authoring/projections/mod.rs` | `engine/crates/vaultspec-api/src/authoring/projections/mod.rs:165` | match |
| `W01.P03.S14` | `engine/crates/vaultspec-api/src/authoring/http/handlers3.rs` | `engine/crates/vaultspec-api/src/authoring/http/handlers3.rs:509` | match |
| `W01.P03.S15` | `engine/crates/vaultspec-api/src/authoring/session/janitor.rs` | `engine/crates/vaultspec-api/src/authoring/permissions.rs:166` | neighbour |
| `W01.P03.S16` | `engine/crates/vaultspec-api/src/authoring/http/tests/helpers2.rs` | `engine/crates/vaultspec-api/src/authoring/permissions.rs:166` | neighbour |
| `W01.P03.S17` | `.vault/adr/2026-07-02-agentic-operation-modes-adr.md` | `frontend/src/stores/server/queries/settings.ts:249` | neighbour |
| `W02.P04.S18` | `frontend/src/stores/server/authoring/wireTypes.ts` | `engine/crates/vaultspec-api/src/authoring/policy.rs:149` | neighbour |
| `W02.P04.S19` | `frontend/src/stores/server/authoring/reviewStationVocabulary.ts` | `frontend/src/stores/server/authoring/reviewStationVocabulary.ts:220` | match |
| `W02.P04.S20` | `frontend/src/locales/en/documents.ts` | `frontend/src/stores/server/authoring/reviewStationVocabulary.ts:220` | neighbour |
| `W02.P04.S21` | `frontend/src/stores/server/authoring/reviewStationVocabulary.test.ts` | `engine/crates/vaultspec-api/src/authoring/policy.rs:131` | neighbour |
| `W02.P05.S22` | `frontend/src/stores/server/authoring/wireTypes.ts` | `engine/crates/vaultspec-api/src/authoring/projections/mod.rs:165` | neighbour |
| `W02.P05.S23` | `frontend/src/stores/server/authoring/adapters.ts` | `frontend/src/stores/server/liveAdapters.session.test.ts:48` | neighbour |
| `W02.P05.S24` | `frontend/src/stores/server/authoring.test.ts` | `frontend/dev/visual-review/specimens/agent.tsx:40` | neighbour |
| `W02.P05.S25` | `frontend/src/app/authoring/ReviewStation.render.test.tsx` | `frontend/dev/visual-review/specimens/agent.tsx:40` | neighbour |
| `W03.P06.S26` | `src/vaultspec_a2a/thread/snapshots.py` | `src/vaultspec_a2a/thread/snapshots.py:72` | match |
| `W03.P06.S27` | `src/vaultspec_a2a/thread/__init__.py` | `src/vaultspec_a2a/thread/snapshots.py:72` | neighbour |
| `W03.P07.S28` | `src/vaultspec_a2a/control/permission_service.py` | `src/vaultspec_a2a/control/permission_service.py:333` | match |
| `W03.P07.S29` | `src/vaultspec_a2a/control/tests/test_permission_rejection_journal.py` | `src/vaultspec_a2a/control/permission_service.py:333` | neighbour |
| `W03.P08.S30` | `src/vaultspec_a2a/graph/nodes/phase_gate.py` | `src/vaultspec_a2a/graph/nodes/phase_gate.py:98` | match |
| `W03.P08.S31` | `src/vaultspec_a2a/graph/nodes/supervisor.py` | `src/vaultspec_a2a/graph/nodes/supervisor.py:340` | match |
| `W03.P08.S32` | `src/vaultspec_a2a/control/permission_service.py` | `src/vaultspec_a2a/graph/nodes/supervisor.py:340` | neighbour |
| `W03.P08.S33` | `src/vaultspec_a2a/api/schemas/gateway.py` | `src/vaultspec_a2a/control/permission_service.py:244` | neighbour |
| `W03.P08.S34` | `src/vaultspec_a2a/api/routes/gateway.py` | `src/vaultspec_a2a/api/schemas/gateway.py:624` | neighbour |
| `W03.P08.S35` | `src/vaultspec_a2a/graph/tests/nodes/test_supervisor.py` | `src/vaultspec_a2a/graph/nodes/phase_gate.py:98` | neighbour |
| `W03.P08.S36` | `src/vaultspec_a2a/api/tests/test_endpoints.py` | `src/vaultspec_a2a/thread/tests/test_clarification.py:155` | neighbour |
| `W03.P09.S37` | `src/vaultspec_a2a/service_tests/test_pw7_acceptance.py` | `src/vaultspec_a2a/service_tests/test_pw7_acceptance.py:973` | match |
| `W03.P09.S38` | `src/vaultspec_a2a/providers/lane_admission.py` | `src/vaultspec_a2a/protocols/mcp/tools/authoring_bridge.py:114` | neighbour |
