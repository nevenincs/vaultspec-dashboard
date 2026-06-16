---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S38'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace figma-parity-reconciliation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S38 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Rebuild the settings dialog from its binding frame, schema-driven from the served settings registry and ## Scope

- `frontend/src/app/settings/SettingsDialog.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Rebuild the settings dialog from its binding frame, schema-driven from the served settings registry

## Scope

- `frontend/src/app/settings/SettingsDialog.tsx`

## Description

- Rebuilt the schema-driven settings dialog faithfully to its binding Figma frame (17:1702) on the canonical Figma role-named type scale and radius, migrating the section headings, the provenance note, the reset/match-global affordances, the inline error, and the scope-target toggle from the legacy alias shims.
- Migrated the dense metadata text from `text-2xs` to the canonical `text-caption` role utility and the scope-target segments from `rounded-vs-sm` to `rounded-fg-xs`.
- Confirmed the dialog remains schema-driven from the served settings registry: it renders the engine-declared groups and a control per declared setting, resolves effective values through the stores selector, and dispatches each control through the control registry, with every rendered row a real consumed setting (theme, reduce_motion, default_granularity, confidence_floor, label_filter) and no dead controls.
- Left the layer boundary intact: the dialog reads schema and values through the stores hooks (sole wire client), persists through usePutSettings, and never fetches or reads the raw tiers block.

## Outcome

The settings dialog now renders on the canonical Figma role-named type scale and radius while staying a schema-driven projection over the engine-owned registry. Adding a setting remains one registry entry that fans out to the served schema, the typed PUT validation, the effective-value selector, and the rendered control with no change to this surface. No control persists a value nothing reads, honoring settings-are-schema-driven-from-one-registry. The file is eslint-clean and prettier-clean (re-formatted after the utility migration).

## Notes

The shared Dialog primitive (`app/chrome/Dialog`) the dialog composes lives outside this phase's scope fence and was left untouched. The shared worktree's concurrent uncommitted scene WIP still fails the full-tree eslint/tsc steps, outside this scope and not introduced here.
