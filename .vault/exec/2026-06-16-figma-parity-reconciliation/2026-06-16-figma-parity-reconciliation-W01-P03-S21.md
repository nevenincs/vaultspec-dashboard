---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S21'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

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
