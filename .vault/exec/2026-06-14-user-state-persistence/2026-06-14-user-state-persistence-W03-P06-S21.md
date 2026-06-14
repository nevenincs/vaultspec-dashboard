---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S21'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace user-state-persistence with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S21 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The wire the new routes into the router and the bearer-gated API prefixes and ## Scope

- `engine/crates/vaultspec-api/src/routes/mod.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# wire the new routes into the router and the bearer-gated API prefixes

## Scope

- `engine/crates/vaultspec-api/src/routes/mod.rs`

## Description

- Registered the two new routes in the router build in `lib.rs`: `/session` (GET `get_session`, PUT `put_session`) and `/settings` (GET `get_settings`, PUT `put_settings`), each as one `MethodRouter` with both verbs.
- Added `/session` and `/settings` to `CONTRACT_ROUTES` so the route inventory and the contract drift loudly rather than silently.
- The `pub mod session;` module declaration was added in S19 (required for the handler file to compile); this step is the router wiring.

## Outcome

The session and settings endpoints are reachable through the router. `cargo build -p vaultspec-api` is clean. The routes sit inside the bearer gate and the tiers-envelope guard like every other API route.

## Notes

- The `.put(...)` chains onto the `MethodRouter` returned by `get(...)`, so no new import was needed beyond the existing `get`/`post`.
