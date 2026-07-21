---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S88'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-product-provisioning with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S88 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Define lifecycle status, job, operation, receipt, ownership, readiness, progress, and typed refusal wire shapes and ## Scope

- `frontend/src/stores/server/engine/statusTypes.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Define lifecycle status, job, operation, receipt, ownership, readiness, progress, and typed refusal wire shapes

## Scope

- `frontend/src/stores/server/engine/statusTypes.ts`

## Description

- Added the tolerant stores-layer wire types for the served `/a2a/lifecycle/*` plane in `statusTypes.ts`, mirroring the engine's `routes/a2a_lifecycle.rs` projection.
- Defined the closed `A2aLifecycleOp` set (install, ensure, start, stop, restart, repair, update, rollback, remove, doctor) matching the engine `LifecycleOpArg` enum.
- Defined the tagged `A2aReadiness` union (`uninstalled`, `installed-stopped`, `gateway-ready` with `worker` cold/ready) mirroring the engine `Readiness` serde shape.
- Defined `A2aInstallState`, `A2aLifecycleStatus` (carrying the flattened `tiers` block so the agent tier rides through), `A2aLifecycleRunBody`, `A2aLifecycleRefusalKind`, and `A2aLifecycleJob`.

## Outcome

New wire types are exported through the existing `engine` barrel (`export * from "./statusTypes"`). tsc, eslint, prettier all green. No adapter needed: the shapes are read tolerantly and additive wire fields are absorbed.

## Notes

The orchestration-tier degradation is deliberately NOT modelled as a new type here — it is read from the existing `tiers.agent` block via `readAgentTierAvailability`. These types carry the install/readiness lifecycle truth, kept distinct from orchestration availability.
