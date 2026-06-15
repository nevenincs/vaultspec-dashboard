# Code↔Figma mapping registry

This is the **Pro-tier stand-in for Figma Code Connect** (which is Organization/Enterprise
only). It is a version-controlled, CI-enforced 1:1 mapping from each React chrome component
to its Figma node, so the two stay cross-connected without the paid feature. See the
`figma-design-bridge` ADR.

## Files

- `component-map.json` — the registry: one entry per exported React component under
  `src/app/`, with its source path and Figma binding (`figmaNodeId` / `figmaUrl`, `null`
  until the Figma node is seeded in plan phase `W01.P09`).
- `registry.schema.json` — JSON Schema for the registry.
- `FIGMA-SEED.md` (added in P09) — the seeding runbook.

## The naming-parity contract

A React component and its Figma main component **share one name, verbatim**
(e.g. `AppShell` ↔ a Figma component named `AppShell`). This 1:1 parity is what makes the
mapping mechanically checkable and is the substitute for Code Connect's binding. The
registry stores the authoritative link (`figmaNodeId`); the name is the human-facing anchor.

## The gate

`npm run figma:registry` (wired into `just dev lint frontend`) discovers the exported
components from source and validates the registry:

- **completeness** — every discovered component has a registry entry;
- **no stale entries** — every registry entry still exists in the code;
- **no source drift** — each entry's `source` matches the file the component lives in;
- **valid bindings** — any populated `figmaNodeId` is a well-formed node id.

Regenerate after adding/moving/removing components, preserving existing Figma bindings:

```
npm run figma:registry -- --write
```

## Parity verification (after seeding)

Once components are bound (P09), `npm run figma:parity` (plan `W01.P10`) uses the read-only
Figma MCP to pull each bound node and diff it against its Storybook render, reporting
drift — the ongoing check that the mirror stays honest.
