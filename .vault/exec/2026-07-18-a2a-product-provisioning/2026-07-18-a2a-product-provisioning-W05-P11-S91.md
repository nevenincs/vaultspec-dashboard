---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S91'
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
     The S91 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Validate every lifecycle dispatch as a closed typed operation with bounded data-removal intent before it reaches the engine client and ## Scope

- `frontend/src/stores/server/a2aLifecycleActions.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Validate every lifecycle dispatch as a closed typed operation with bounded data-removal intent before it reaches the engine client

## Scope

- `frontend/src/stores/server/a2aLifecycleActions.ts`

## Description

- Added `a2aLifecycleActions.ts`: the terminal dispatch effect registered onto the one platform `appDispatcher` under `a2a-lifecycle:run`, mirroring `provisionActions`/`opsActions`.
- Authored `isA2aLifecycleRunPayload`: a bounded, typed validator that accepts ONLY a closed body of a single enumerated `op` and nothing else.
- Exported `dispatchA2aLifecycleRun` which re-validates before dispatch and resolves with the `{job, attached}` envelope.

## Outcome

The validator is the wire-contract guard: a malformed op, a smuggled client `path`, a free-form `args` field, or any implicit data-removal flag (`delete_data`/`purge`) riding a `remove` is refused BEFORE the wire. `remove` is a bounded intent — the engine preserves user data and no client-side purge flag exists. Gate green; the handler holds no cache write (the run hook owns invalidation).

## Notes

None.
