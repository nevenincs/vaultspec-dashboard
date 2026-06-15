# Working across Figma and the codebase

The frontend design system is **code-canonical with Figma as a synced mirror**. This is
the day-to-day workflow for cross-referencing and driving change in both directions. It
assumes the mirror exists (see `FIGMA-SEED.md`) and the claude.ai Figma MCP is connected.

- **File:** `8WDmXNOURdRQwdefWNGsBb` · the `MIRROR` container (node `23:2`).
- **Map:** `component-map.json` — each React component → its Figma node id + url.
- **Identity:** every Figma frame is named 1:1 with its React component; that name is the
  join. `figma:registry` + `figma:parity` keep the join honest.

## The two directions

### Figma → code (design drives implementation)

The point of the mirror: a designer reshapes a surface in Figma, and an agent implements
that change in code.

1. **Edit in Figma.** Adjust a component's node in the `MIRROR` container — spacing,
   hierarchy, composition, a new element, a control state.
2. **Find the source.** Look up the component in `component-map.json` (Figma node id →
   `source` path). E.g. node `19:3` → `WorkspacePicker` → `src/app/left/WorkspacePicker.tsx`.
3. **Pull the design context.** `get_design_context({ fileKey, nodeId })` returns the
   node's structure, measurements, and a screenshot. Read it against the existing source.
4. **Implement in code, idiomatically.** Translate the intent — NOT the literal output.
   Use the existing token classes (`bg-paper-raised`, `text-ink`, `rounded-vs-md`,
   `gap-vs-2`, the type scale) and shared components; never paste raw hex/px. The Figma
   node tells you *what changed*; the codebase tells you *how to express it*.
5. **Re-mirror.** Rebuild that component frame from the new code (`use_figma`) so the
   mirror tracks the implementation, then refresh its node id and re-run the gates.

**What may NOT originate in Figma: colour/token values.** Tokens are code-canonical
(DTCG → CSS + Figma variables, one way). Figma stores resolved hex per mode and cannot
round-trip OKLCH, so a colour change is authored in the token source (`frontend/tokens/`
→ `styles.css` + the Figma variable push), not by editing a Figma fill. Layout,
structure, composition, and copy can originate in Figma; colour cannot.

### Code → Figma (keep the mirror current)

When a component changes in code, re-mirror it so the design stays truthful:

1. Read the component source; identify its tokens (hex + variable name), spacing/type,
   and icons (`figma/icons.json` for Lucide/Phosphor; `src/scene/field/marks.ts` for
   domain marks).
2. Build the frame via `use_figma` into the `MIRROR` container, fills **bound** to the
   `public/*` Semantic variables (theme-aware).
3. Update `component-map.json` + `figma-snapshot.json` with the node id; run the gates.

## Guardrails baked into the build (learned, load-bearing)

`use_figma` runs JS via the Figma Plugin API. These prevent silent failures:

- **It reverts the entire call on any unhandled throw.** Build one component per call;
  a single bad statement loses the whole frame.
- **No `createPage` / `setCurrentPageAsync`** — they throw/revert in this MCP context.
  Build on the current page.
- **`layoutAlign` / `layoutGrow` only after `appendChild`** into an auto-layout parent
  (append-then-configure).
- **Load fonts before editing existing text** (`loadFontAsync`).
- **`clipsContent = false` on containers**, and hug heights: vertical frames
  `primaryAxisSizingMode = 'AUTO'`, horizontal `counterAxisSizingMode = 'AUTO'`. If a
  panel renders short/clipped, re-hug it bottom-up.
- **One-line truncation:** `node.maxLines = 1; node.textTruncation = 'ENDING'`.
- **`use_figma` returns no value** — read new node ids back via `get_metadata` (target a
  small container like `MIRROR`, not the whole page), then `get_screenshot` to verify.
- **The PixiJS scene is not mirrored** — represent it as a neutral `canvas-bg` ground.

## Parallel buildout (for large re-mirrors)

The mirror was built partly by parallel sub-agents — each given the build recipe (token
map, helper functions, these guardrails), a **disjoint coordinate band** so writes don't
collide, and a reference node to match the quality bar. The Figma MCP is available to
sub-agents; Figma serialises the writes. Reuse this when re-mirroring many components.

## Verification

```
npm run figma:registry   # every surface maps 1:1 to a real, correctly-named node
npm run figma:parity     # bound nodes exist and names match (against figma-snapshot.json)
npm run tokens:check      # the DTCG → CSS token drift gate
just dev lint frontend    # the full gate (eslint + prettier + tsc + the above)
```

## Tier ceiling

At the Pro plan, **Code Connect and the Variables REST API are unavailable** (Org/
Enterprise-only). The `component-map.json` registry + naming parity is the sanctioned
substitute for Code Connect; the Plugin-API push is the substitute for Variables REST.
If the org upgrades, the registry promotes to real Code Connect without rearchitecting.
