---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S19'
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
     The S19 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The add GET and PUT session endpoints carrying the tiers block and ## Scope

- `engine/crates/vaultspec-api/src/routes/session.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# add GET and PUT session endpoints carrying the tiers block

## Scope

- `engine/crates/vaultspec-api/src/routes/session.rs`

## Description

- Created the new route module `session.rs` with `get_session` and `put_session` handlers.
- `GET /session` returns the shared `{data, tiers}` envelope where `data` is `workspace`, `active_scope`, `scope_context` (`folder` + `feature_tags`), and `recents`, all snake_case.
- Read the active scope, that scope's context, and the recents through the shared `user_state` handle inside ONE scoped guard that drops before the envelope is built, honoring the never-hold-a-Mutex-guard-across-await discipline.
- `PUT /session` accepts a partial body: `active_scope`, `scope_context` (`scope`, `folder`, `feature_tags`), and `push_recent`; an absent field leaves that part untouched.
- On `active_scope`, validated and warmed the scope through the registry FIRST (before any user-state lock) so an unknown scope is a 400 carrying the tiers block, then retargeted and persisted the active scope.
- Persisted `scope_context` (defaulting to the active scope) and `push_recent` inside one scoped guard; PUT returns the same shape GET serves.
- Declared `pub mod session;` so the module compiles; router/gate wiring lands in S21/S22.

## Outcome

The session GET and PUT endpoints exist and carry the tiers block through the shared `envelope`/`api_error` helpers. `cargo build -p vaultspec-api` is clean. The wire shape is defined in clean snake_case as the contract W04's client and mock must mirror.

## Notes

- The registry warm of a new `active_scope` is done before the user-state lock is taken, so a cold-scope index never runs under that lock.
- No `.await` sits between a user-state lock and its release in any handler; the scoped-guard pattern is kept explicit so a future edit cannot silently introduce one.
