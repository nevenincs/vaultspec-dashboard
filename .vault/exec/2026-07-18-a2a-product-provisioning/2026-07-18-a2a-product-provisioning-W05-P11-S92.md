---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S92'
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
     The S92 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Project backend-served install, ownership, gateway, worker, provider, admission, job, update, rollback, repair, and doctor state with bounded polling and ## Scope

- `frontend/src/stores/server/a2aLifecycle.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Project backend-served install, ownership, gateway, worker, provider, admission, job, update, rollback, repair, and doctor state with bounded polling

## Scope

- `frontend/src/stores/server/a2aLifecycle.ts`

## Description

- Added `a2aLifecycle.ts`, the stores-owned lifecycle projection: `useA2aLifecycleStatus` (bounded staleTime/gcTime), `useA2aLifecycleRun` (dispatch + status invalidation), and `useA2aLifecycleJob` (bounded trigger-then-poll, stop-on-terminal, invalidate-on-settle).
- Authored the pure `deriveA2aLifecycleView` projection and its `deriveEligibleOps` helper mapping install-state + readiness to the eligible/destructive op sets, plus the orchestration availability read via the canonical `readAgentTierAvailability`.
- Exposed `A2A_DESTRUCTIVE_OPS` (remove, rollback) for the confirm affordance.

## Outcome

The projection is a PURE function the panel wraps in one `useMemo` — never a fresh reference minted inside a reactive read (frontend-store-selectors). Polling is bounded (interval resolver returns false once terminal); a settled job invalidates the status so the panel re-reads. The engine remains the authority on op legality; eligibility is a UX hint only. Gate green.

## Notes

None.
