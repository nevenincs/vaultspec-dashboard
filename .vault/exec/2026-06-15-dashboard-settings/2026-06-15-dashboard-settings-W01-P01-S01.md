---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S01'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-settings with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S01 and 2026-06-15-dashboard-settings-plan placeholders are machine-filled by
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
     The Define the settings schema registry types: key, value type, default, scope eligibility, constraints, and UI-hint control kind and ## Scope

- `engine/crates/vaultspec-session/src/settings_schema.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Define the settings schema registry types: key, value type, default, scope eligibility, constraints, and UI-hint control kind

## Scope

- `engine/crates/vaultspec-session/src/settings_schema.rs`

## Description

- Defined the schema vocabulary in the session crate: the tagged `SettingType` (enum/bool/string/integer with constraints), `ControlKind` (segmented/switch/text/slider), the `SettingDef` record, and the typed `ValidationError`.
- Made every type serde-serializable so the registry serializes straight onto the wire.

## Outcome

A typed, serializable registry vocabulary in place as the foundation for the single source of truth.

## Notes

