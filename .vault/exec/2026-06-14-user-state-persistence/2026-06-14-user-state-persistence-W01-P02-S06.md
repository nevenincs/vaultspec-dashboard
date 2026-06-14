---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S06'
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
     The S06 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The implement the settings model with global and scoped keys and ## Scope

- `engine/crates/vaultspec-session/src/settings.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# implement the settings model with global and scoped keys

## Scope

- `engine/crates/vaultspec-session/src/settings.rs`

## Description

- Define the `Setting` key/value domain type in `settings.rs`.
- Add `global_setting`/`set_global_setting` over the `GLOBAL_SCOPE` sentinel and `scoped_setting`/`set_scoped_setting` over an explicit scope, sharing a private upsert and read helper.
- Add `list_settings` returning a scope's entries ordered by key.

## Outcome

Global and scope-scoped settings round-trip and update independently: a scoped key does not implicitly fall back to the global value, leaving precedence composition to the caller, and `list_settings` is scoped and key-ordered. The settings domain reuses the same `(scope, key)` table the schema defines, distinguishing global from scoped purely by the empty-string scope sentinel.

## Notes

Scoped settings deliberately do NOT fall back to global on a miss; the read returns `None` so a future API layer can compose the global-then-scoped precedence explicitly rather than having it baked into the store.
