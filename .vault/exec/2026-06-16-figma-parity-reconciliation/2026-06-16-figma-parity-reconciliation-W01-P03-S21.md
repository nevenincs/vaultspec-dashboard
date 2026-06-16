---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S21'
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
     The S21 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Author parse-clean figma mappings for every mappable code component against its Kit primitive and ## Scope

- `frontend/figma/connect/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Author parse-clean figma mappings for every mappable code component against its Kit primitive

## Scope

- `frontend/figma/connect/`

## Description

- Confirm 13 `*.figma.tsx` mappings exist under `figma/connect/`, one per mappable code component bound to its Kit primitive.
- Confirm each mapping imports the real component from `src/app/` and calls `figma.connect(Component, "<MIRROR>?node-id=<id>", { example })` with a node id matching the registry binding for that component.
- Confirm each `example` renders a valid element with the component's required props supplied (for example `RailTabs` with `active`/`onChange`, `HoverCard` with a `model` and `onOpen`, `FacetChipGroup` with `label`/`values`/`selected`/`onToggle`, the settings controls with `def`/`value`/`onChange`/`id`).

## Outcome

All 13 mappings are present and parse-clean: `CodeTree`, `ContextMenuHost`, `EnumControl`, `FacetChipGroup`, `HoverCard`, `LeftRail`, `NumberControl`, `RailTabs`, `SwitchControl`, `TextControl`, `Timeline`, `TreeBrowser`, and `WorkTab`. The `figma connect parse` run emits one entry per mapping with its component name, node-url, and resolved source location, and the prettier `format:check` in the frontend gate passes for the connect files. Each node-url resolves to the live design file via the `<MIRROR>` substitution.

## Notes

The remaining design-surface components in the registry are intentionally left unbound (38 of 51 surfaces) because they have no standalone Kit primitive under frame `135:2` to map against; they remain `figmaNodeId: null` in the registry and carry no `*.figma.tsx` mapping, which the registry validator accepts. Binding them awaits the chrome and canvas rewrite Waves that build the surfaces against the designs. The mappings were authored by the prior repoint; this phase verified parse-cleanliness rather than re-authoring them.
