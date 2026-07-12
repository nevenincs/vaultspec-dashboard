---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# `authoring-surface` `W02.P03` summary

All three steps complete (S09-S11). The stores layer now consumes the two net-new W01 backend seams — the section-anchored comments plane (D2) and the ledgered plan-step tick (D1) — as the sole wire client, with bounded caches, tolerant adapters, denials-as-values outcomes, and live-wire tests over the real engine. Code review pending.

- Modified: `frontend/src/stores/server/authoring.ts`
- Created: `frontend/src/stores/server/authoringComments.ts` (module-size follow-up: the comment vocabulary + adapters extracted out of the grandfathered `authoring.ts` monolith, re-exported from it to keep the public surface stable)
- Created: `frontend/src/stores/server/queries/comments.ts`
- Modified: `frontend/src/stores/server/queries/mutations.ts`
- Modified: `frontend/src/stores/server/queries/index.ts`
- Created: `frontend/src/stores/server/comments.live.test.ts`
- Modified: `frontend/src/testing/fixtures/live-vault/.vault/plan/2026-01-03-alpha-plan.md`
- Modified: `frontend/src/app/menus/guardedContextMenu.test.ts`

## Description

The wire client (S09) gained the four comment routes (`listComments`/`createComment`/`updateComment`/`deleteComment`) plus their served vocabulary and tolerant adapters, the `set_plan_step_state` direct-write variant, a generic `sendJson` transport for PATCH/DELETE, and the `authoringKeys.comments(scope, nodeId)` key placed under the `authoring` prefix so the existing lifecycle-stream invalidation refreshes an open thread for free. The comment routes serve typed errors (not denial values), so a create/edit/delete resolves to the record and throws a tiers-bearing error only on a genuine refusal; the plan tick rides the existing denials-are-values direct-write outcome.

The hooks (S10) expose `useDocumentComments` (bounded, mount-gated, keyed on scope+nodeId, subscribing the ref-counted authoring lifecycle stream while mounted so a comment created elsewhere reaches it), the five comment mutation hooks that invalidate exactly the affected document's comment query on settle, and `usePlanStepTick` (a typed ticked/conflict/refused result that invalidates the vault-mutation read surfaces — the plan-interior projection among them — on a successful tick). Store-selector law is honored: raw query results, `useMemo`-ready.

The live-wire tests (S11) exercise anchored/orphaned comment resolution, the CRUD round-trip, the comment SSE delta path, and the plan tick flipping the served plan-interior state with an idempotent re-tick and a settled restore, all over the real engine + fixture vault. Canonicalizing the fixture plan (mandatory `tier: L1` + canonical backticked-id/`;`-scope Steps under the H1) was required to make it tickable by the plan CLI; a pre-existing stale guard-test path from the earlier `queries.ts` decomposition was repointed to `queries/workspaces.ts`.

## Verification

- Full frontend vitest suite green: 2879/2879, including the new `comments.live.test.ts` (7/7), the filter-plan-state live test and the touch-selectability guard that read the same fixture.
- `npx tsc --noEmit`, `eslint`, and `prettier --check` clean on every touched file.
- `just dev lint frontend` currently exits non-zero ONLY on the module-size baseline tripping over a FOREIGN uncommitted deletion of an engine-graph crate file (another agent's in-flight work in the shared worktree) — unrelated to this phase.
- No test doubles: every test rides the live `vaultspec serve` origin over the committed fixture vault.
