# Working from binding Figma to the codebase

The frontend design system is **Figma-binding**. The live Figma file is the design source
of truth; code is authored to match it while preserving the existing stores and scene
contracts. This is the day-to-day workflow for cross-referencing the live file, local
registry, and implementation.

- **File:** `SlhonORmySdoSMTQgDWw3w` · the live `vaultspec-dashboard` design file.
- **Map:** `component-map.json` — each React component → its Figma node id + url.
- **Identity:** each React component keeps its local `name`. Same-name Figma bindings are
  the default; intentional primitive aliases declare `figmaNodeName` and `bindingKind`.
  `figma:registry` + `figma:parity` keep the join honest.

## The two directions

### Figma → code (normal direction)

The normal direction is Figma first: a designer reshapes a surface in the binding file,
and an agent implements that change in code.

1. **Edit in Figma.** Adjust the component's live node — spacing,
   hierarchy, composition, a new element, a control state.
2. **Find the source.** Look up the component in `component-map.json` (Figma node id →
   `source` path). E.g. node `19:3` → `WorkspacePicker` → `src/app/left/WorkspacePicker.tsx`.
3. **Pull the design context.** `get_design_context({ fileKey, nodeId })` returns the
   node's structure, measurements, and a screenshot. Read it against the existing source.
4. **Implement in code, idiomatically.** Translate the intent — NOT the literal output.
   Use the existing token classes (`bg-paper-raised`, `text-ink`, `rounded-vs-md`,
   `gap-vs-2`, the type scale) and shared components; never paste raw hex/px. The Figma
   node tells you _what changed_; the codebase tells you _how to express it_.
5. **Refresh the local map.** If the live Figma node changed identity, update
   `component-map.json`, refresh `figma-snapshot.json` from MCP, then re-run the gates.
   If the live node name differs from the React component because Figma uses a canonical
   primitive name, keep the React name and record the Figma name in `figmaNodeName`.

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
3. Update `component-map.json` + `figma-snapshot.json` with the node id; run the gates.
   Mark direct same-name bindings as `surface`, deliberate primitive wrappers as
   `primitive`, and uncertain semantic matches as `needs-review` until design confirms
   the target.

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
npm run figma:registry   # every local registry URL points at the live file and is classified
npm run figma:parity     # bound nodes exist and match name or explicit figmaNodeName alias
npm run tokens:check      # the DTCG → CSS token drift gate
just dev lint frontend    # the full gate (eslint + prettier + tsc + the above)
```

## Tier ceiling

Use the `@figma/code-connect` CLI for Code Connect mappings. The MCP Code Connect tools
can be plan-gated even when the CLI works. Keep `FIGMA_ACCESS_TOKEN` in `frontend/.env`,
use `npx figma connect parse` before publish, and keep every node URL on
`SlhonORmySdoSMTQgDWw3w`.
