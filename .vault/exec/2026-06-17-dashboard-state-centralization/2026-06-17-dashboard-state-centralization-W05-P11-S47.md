---
tags:
  - '#exec'
  - '#dashboard-state-centralization'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S47'
related:
  - "[[2026-06-17-dashboard-state-centralization-plan]]"
  - "[[2026-06-17-dashboard-state-centralization-audit]]"
---

# Run the codify check for durable state-ownership rules

## Scope

- `.vaultspec/rules/rules/views-are-projections-of-one-model.md`
- `.codex/rules/views-are-projections-of-one-model.md`

## Description

- Used the vaultspec codify workflow after the final audit.
- Verified the durability criteria:
  - the campaign completed a full execution cycle;
  - the lesson is project-specific state/view ownership, not generic advice;
  - the existing `views-are-projections-of-one-model` rule partially covered it
    and should be edited in place rather than duplicated.
- Tightened the rule to name backend dashboard-state plus TanStack stores helpers
  as the authority for shared dashboard intent.

## Outcome

- No new rule was created.
- The existing rule now states that shared dashboard intent lives in backend
  dashboard-state, and that local view stores may hold only local chrome or
  entity metadata outside the shared contract.

## Verification

- `vaultspec-core spec rules list`
- `vaultspec-core spec rules show views-are-projections-of-one-model`
- `vaultspec-core spec rules show dashboard-layer-ownership`
- `git diff --check -- .vault/audit/2026-06-17-dashboard-state-centralization-audit.md .vault/exec/2026-06-17-dashboard-state-centralization/2026-06-17-dashboard-state-centralization-W05-P11-S46.md .vaultspec/rules/rules/views-are-projections-of-one-model.md .codex/rules/views-are-projections-of-one-model.md engine/crates/vaultspec-api/src/routes/state.rs frontend/src/app/stage/Stage.render.test.tsx`
