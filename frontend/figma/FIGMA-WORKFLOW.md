# Working from binding Figma to the codebase

The frontend design system is **Figma-binding**. The live Figma file is the design source
of truth; code is authored to match it while preserving the existing stores and scene
contracts. This is the day-to-day workflow for cross-referencing the live file, local
registry, and implementation.

- **File:** `SlhonORmySdoSMTQgDWw3w` · the live `vaultspec-dashboard` design file.
- **Join:** the name is the contract — a component's Figma name **equals** its React
  export symbol (the ruleset lives in `README.md`). There is no `component-map.json`
  registry and no Code Connect (both removed). For aliases/sub-frames, the node id is
  cited in the React file header as `// @figma <Name> · SlhonORmySdoSMTQgDWw3w · <nodeId>`.
- **Resolution:** Figma → code = `grep` the node id (or the bare name) across
  `frontend/src`; code → Figma = read the file's `@figma` header, or MCP
  `search_design_system` by the React symbol name (same-name, so it resolves).

## The two directions

### Figma → code (normal direction)

The normal direction is Figma first: a designer reshapes a surface in the binding file,
and an agent implements that change in code.

1. **Edit in Figma.** Adjust the component's live node — spacing,
   hierarchy, composition, a new element, a control state.
2. **Find the source.** `grep -rn "<nodeId>" frontend/src` (the id is cited in the
   component header), or search for the bare component name — it equals the React export.
   E.g. node `634:2090` → search `CommandPalette` → `src/app/palette/CommandPalette.tsx`.
3. **Pull the design context.** `get_design_context({ fileKey, nodeId })` returns the
   node's structure, measurements, and a screenshot. Read it against the existing source.
4. **Implement in code, idiomatically.** Translate the intent — NOT the literal output.
   Use the existing token classes (`bg-paper-raised`, `text-ink`, `rounded-vs-md`,
   `gap-vs-2`, the type scale) and shared components; never paste raw hex/px. The Figma
   node tells you _what changed_; the codebase tells you _how to express it_.
5. **Keep the join honest.** If the live Figma node was renamed, rename the React export
   to match (the name IS the join), or — when Figma deliberately uses a different canonical
   name — keep the React name and record the alias in the file header:
   `// @figma <FigmaName> · SlhonORmySdoSMTQgDWw3w · <nodeId> · alias-of <ReactExport>`.
   A rename is a contract event: change both sides in the same commit.

**Token caveat:** Figma is still binding for foundation values, but the codebase preserves
the OKLCH/DTCG generation mechanism. When a Figma foundation value changes, update
`frontend/tokens/` to match the binding value, regenerate CSS/Tokens Studio output, and
verify the live file agrees. Do not hand-type raw hex into components.

### Code → Figma (mechanical verification path)

When code changes require a Figma-side refresh, treat it as a mechanical projection back
to the binding file, not a new authority source:

1. Read the component source; identify its tokens (hex + variable name), spacing/type,
   and icons (`figma/icons.json` for Lucide/Phosphor; `src/scene/field/marks.ts` for
   domain marks).
2. Build or update the live node via `use_figma`, fills **bound** to the
   `public/*` Semantic variables (theme-aware), after inspecting the file conventions.
3. Name the new/updated Figma node to **equal** its React export symbol (or, for a
   deliberate alias, cite it in the React header per the contract). New boards/sections
   follow `[Band] Topic`; internal parts follow `_Parent/Part`. Verify with `get_metadata`.

## Guardrails baked into the build (learned, load-bearing)

`use_figma` runs JS via the Figma Plugin API. These prevent silent failures:

- **It reverts the entire call on any unhandled throw.** Build one component per call;
  a single bad statement loses the whole frame.
- Use `await figma.setCurrentPageAsync(page)` when switching pages through `use_figma`;
  do not assign `figma.currentPage` directly.
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

Large Figma refreshes can use parallel sub-agents — each given the build recipe, token
map, helper functions, these guardrails, and a disjoint surface scope. The Figma MCP is
available to sub-agents; Figma serialises writes.

## Verification

```
npm run figma:names    # @figma headers are well-formed and point at SlhonORmySdoSMTQgDWw3w
npm run tokens:check   # the DTCG → CSS token drift gate
just dev lint frontend # the full gate (eslint + prettier + tsc + the above)
```

Parity by name is a read-only MCP spot-check, not a local gate: `search_design_system`
by a React symbol should resolve to the same-name node (or its cited alias).

## No Code Connect

Code Connect is Org/Enterprise-only and is **not** used here (the CLI, the
`component-map.json` registry, and the `figma:registry`/`figma:parity` gates were all
removed). The name-as-contract in `README.md` is the substitute. Do not reintroduce
`@figma/code-connect`, `.figma.tsx` files, or a central registry.
