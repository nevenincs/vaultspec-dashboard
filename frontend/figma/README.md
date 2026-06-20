# Live Figma binding registry

This is the version-controlled, CI-enforced map from React chrome components to nodes in
the live binding Figma file `SlhonORmySdoSMTQgDWw3w`. Figma is the source of truth for
the dashboard design; the registry records which live node each local surface is bound to
and supplies the same node IDs used by the `@figma/code-connect` CLI files.

## Files

- `component-map.json` — the registry: one entry per exported React component under
  `src/app/`, with its source path, live Figma binding (`figmaNodeId` / `figmaUrl`),
  optional Figma-name alias (`figmaNodeName`), and binding classification (`bindingKind`).
- `registry.schema.json` — JSON Schema for the registry.
- `FIGMA-SEED.md` (added in P09) — the seeding runbook.

## The binding contract

A React component keeps its local code identity in `name`. By default, its bound Figma
node is expected to share that name verbatim. When the live design intentionally uses a
canonical primitive name instead, declare that target with `figmaNodeName` rather than
renaming the code component to satisfy the gate.

Every populated binding must also declare `bindingKind`:

- `surface` — a direct surface/component binding where the Figma node name matches
  `name`;
- `primitive` — an intentional local wrapper to canonical Figma primitive alias, such as
  `EnumControl` bound to `SegmentedToggle`;
- `composite-state` — a defensible binding to a named composite or stateful variant;
- `needs-review` — a live node exists, but the semantic target needs design review before
  it should be treated as settled.

The registry stores the authoritative live-file link (`figmaNodeId` / `figmaUrl`); the
component name and optional alias are the human-facing anchors.

## The gate

`npm run figma:registry` (wired into `just dev lint frontend`) discovers the exported
components from source and validates the registry:

- **completeness** — every discovered component has a registry entry;
- **no stale entries** — every registry entry still exists in the code;
- **no source drift** — each entry's `source` matches the file the component lives in;
- **valid bindings** — any populated `figmaNodeId` is well-formed and any populated
  `figmaUrl` points at `SlhonORmySdoSMTQgDWw3w`;
- **classified bindings** — every bound node declares `bindingKind`, and any alias is
  explicit through `figmaNodeName`.

Regenerate after adding/moving/removing components, preserving existing Figma bindings:

```
npm run figma:registry -- -- --write
```

## Parity verification (after seeding)

Once components are bound, `npm run figma:parity` checks the MCP-captured
`figma-snapshot.json` from the live file and verifies each bound node still exists with
the expected name: `figmaNodeName` when present, otherwise the local component `name`.
Visual drift checks can build on that node inventory.
