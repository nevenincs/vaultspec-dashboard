---
tags:
  - '#exec'
  - '#advanced-service-console'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:220554fc9e2a95438219d777008376ce414f470b37e0a8a5a8e6de1584e8e4a9'
step_id: 'S01'
related:
  - "[[2026-08-01-advanced-service-console-plan]]"
---

# Add the Advanced section frame to the settings dialog, rendered after the schema-driven groups, with the palette command Open service console

## Scope

- `frontend/src/app/settings`

## Description

- Add `AdvancedSection`, the one designed non-schema section, rendered after the schema-driven group map in `SettingsDialog`.
- Add the accordion store `advancedConsole` holding one nullable expanded id, so at most one console is open and expansion doubles as the mount gate.
- Register the four console folds - index, system status, project health, agent lifecycle - each rendering its console body only while expanded.
- Add `openAdvancedSettings`, the deep link that opens the settings dialog with the primary console already expanded.
- Add the `app:advanced-settings` action descriptor in the shared chrome-action builders and enrol it through a pure command provider in the one command registry.
- Add the section guard proving the collapsed folds mount nothing and read nothing, that one console is expanded at a time, that retired panel ids resolve to nothing, and that the labels re-render in place across locales.

## Outcome

Settings gains the one canonical home for operational consoles. The section is deliberately not schema-driven: the engine settings registry stays the authority for settings VALUES, and a console is not a value. Expansion is the mount gate, so someone who opens settings to change a theme runs none of the console polls. The palette reaches the section through one command over the shared descriptor rather than a hand-typed entry.

## Notes

The section renders nothing at all when its title message falls back, so a catalog gap degrades to absence rather than to a placeholder heading.
