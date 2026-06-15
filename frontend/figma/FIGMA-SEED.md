# Figma seeding (plan W01.P09) — executed 2026-06-15

> **DEDUPLICATION NOTE (2026-06-15).** A second concurrent session (`0fdecf45`) was
> authoring the SAME Figma file in parallel — further along, in an organized `MIRROR`
> canvas (node 23:2) with faithful, editable, variable-bound regions (LeftRail 19:2, Stage
> 22:2, HoverCard 10:2, Foundations·Icons&Type 13:2 with real vectorized icons). To stop
> double-encoding, **this session's duplicate seed nodes were removed** (the stub
> Components grid 4:2 and the duplicate Foundations swatch board 5:2, which also held the
> interim image-fill experiments), and the registry bindings were **reset to null**. The
> live Figma editable recreation is owned by session `0fdecf45`; it will re-point the
> registry at its MIRROR nodes. The code-side bridge (tokens → variables, registry,
> validator, parity harness, stories, dom-extract/RECREATE pipeline) remains and is what
> that session builds on. The node references below are HISTORICAL (now deleted).

The Figma mirror was seeded directly via the claude.ai Figma MCP (full editor seat), not the
Tokens Studio / importer route. One-way, code → Figma; Figma is never canonical.

## The file

- File: **Vaultspec Dashboard — Design System (code mirror)**
- URL: https://www.figma.com/design/8WDmXNOURdRQwdefWNGsBb
- fileKey: `8WDmXNOURdRQwdefWNGsBb`

## What was seeded

- **Variables** (from `tokens/figma/tokens.json`):
  - `Primitives` collection (one mode) — 35 OKLCH-derived hex primitives.
  - `Semantic` collection — 43 tokens across **Light / Dark / High Contrast** modes,
    aliasing the primitives where the source does.
- **Components page** (`node 4:2`) — 50 named frames, one per registry component, named to
  the 1:1 naming-parity contract, fills/stroke/text bound to the Semantic variables (so they
  are theme-aware). Node ids recorded back into `component-map.json` and `figma-snapshot.json`.
- **Foundations board** (`node 5:2`) — the public color surface as variable-bound swatches,
  grouped (surface / ink / border-accent-focus / tier / state / status-diff).

Screenshots captured at seed time: `seed-components.png`, `seed-foundations.png`.

## Verified

- `get_variable_defs` resolves the bound tokens on a component node (e.g. `public/chrome/paper`
  → `#fdfaf6`).
- `npm run figma:registry` → 50/50 mapped + bound; `npm run figma:parity` → 50/50 match.
- **Code Connect** was attempted and rejected: *"You need a Developer seat in an Organization
  or Enterprise plan."* — confirming the ADR's constraint; the repo mapping registry is the
  sanctioned substitute at this tier.

## Follow-on (depth, not blocking the cross-connection)

- The 50 component nodes are **named seed frames**, not pixel-perfect recreations. Full visual
  fidelity needs either manual design or `generate_figma_design` against a **public** Storybook
  URL (the remote MCP can't reach localhost). This is plan step S40's depth tail.
- Type-scale and the Lucide/Phosphor + in-family icon set are not yet seeded as Figma nodes
  (S39 tail). Color foundations are seeded.
- Screenshot-diff parity (S44) is meaningful only once the nodes are seeded at fidelity.

## Re-seeding

Re-run the token export (`npm run tokens:figma`) and re-push variables via the MCP; re-run
`npm run figma:registry -- --write` if components change, then re-record node ids.
