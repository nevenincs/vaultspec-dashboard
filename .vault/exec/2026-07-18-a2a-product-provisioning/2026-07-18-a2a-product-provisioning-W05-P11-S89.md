---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S89'
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
     The S89 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Add bearer-gated lifecycle status, run, and job methods without exposing a browser-to-A2A transport and ## Scope

- `frontend/src/stores/server/engine/client.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add bearer-gated lifecycle status, run, and job methods without exposing a browser-to-A2A transport

## Scope

- `frontend/src/stores/server/engine/client.ts`

## Description

- Added three bearer-gated lifecycle methods to the one `EngineClient` in `client.ts`: `a2aLifecycleStatus`, `a2aLifecycleRun`, `a2aLifecycleJob`.
- Routed each through the existing private `get`/`post` helpers so the browser bearer is carried exactly as every other route, and the response envelope is unwrapped (flattening the `tiers` block onto the projection).
- Imported the new wire types from the `statusTypes` module type barrel.

## Outcome

The dashboard reaches the A2A component ONLY through the engine — there is no browser-to-A2A transport method on the client. A lifecycle refusal surfaces as an `EngineError` whose typed `errorKind` names the cause. Gate green.

## Notes

None.
