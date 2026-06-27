# Figma ↔ code naming contract

This project has **no Figma Code Connect** (it requires an Org/Enterprise seat we do not
have) and **no central component-map registry** (both were removed — see
`git log --grep="Code Connect"`). The join between the binding Figma file and the React
codebase is carried by **the names themselves**, with a cited-node fallback. This document
is the canonical ruleset; `FIGMA-WORKFLOW.md` is the day-to-day procedure.

- **Binding file:** `SlhonORmySdoSMTQgDWw3w` — the live `vaultspec-dashboard` design file.
  Figma is the binding source of truth (`figma-is-the-binding-source-of-truth` rule).
- **The join:** a component's Figma name **equals** its React export symbol. No registry,
  no `.figma.tsx`, no Code Connect.

## The ruleset (every node derives from this)

A node is classified into exactly one class; each class has one fixed render:

| Class | What it is | Name render | Example |
| --- | --- | --- | --- |
| **Component** | a node with a 1:1 React counterpart | bare PascalCase, `== the React export symbol` | `CommandPalette`, `StatusTab`, `Button` |
| **Variant leaf** | a variant inside a component set | Figma-native `Property=Value` axes (required for the variant picker) | `Variant=Primary, State=Hover` |
| **Sub-component** | an internal part with no standalone React export | `_Parent/Part` (leading `_` hides it from the Assets panel) | `_Pill/Row2/Labels`, `_BottomSheet/Handle` |
| **Container board / section** | an organizational grouping | `[Band] Topic` | `[Kit] Components`, `[Surface] Activity Rail` |
| **Foundations** | non-component design references | `[Foundations] Topic` | `[Foundations] Colour` |
| **State preview frame** | a standalone frame showing one state/mode of a surface | dot-path `Component.state[.qualifier]` | `SearchPaletteSurface.expanded`, `FeatureSearchField.open` |
| **Study / proposal** | a non-binding exploration | `[Study] Topic` | `[Study] Graph Hover` |

Fixed vocabulary and separators:

- **Bands:** `Foundations`, `Kit`, `Surface`, `Graph`, `Mobile`, `States`.
- **State vocabulary:** match the existing Figma vocab as-is — `Typical`, `Loading`,
  `Degraded`, `Empty`, `Skeleton`. Do **not** normalize or invent new state words.
- **Theme** is a Figma **variable mode** (Light / Dark / High-Contrast), not a name
  dimension: one frame recolours when the mode switches (mirrors code's `[data-theme]`).
  Add a `.theme` qualifier only to a node genuinely pinned to one theme — never duplicate
  frames per theme.
- **Separators:** `/` for hierarchy (band/sub-part), `=` / `, ` for variant axes
  (`Property=Value, Property=Value`), `.` for the state/mode address on preview frames,
  `[ ]` for the organizational band tag. One scheme per class — no ad-hoc ` — ` / ` - ` /
  ` · ` / `(parens)` drift.

## The cited-node fallback (registry replacement)

Names resolve the vast majority of cases. For the rest — an alias (Figma name ≠ React
export), a sub-frame, or disambiguation — the binding node id lives in the React file's
header comment, in one canonical greppable form:

```tsx
// @figma <Name> · SlhonORmySdoSMTQgDWw3w · <nodeId>
// e.g.  @figma CommandPalette · SlhonORmySdoSMTQgDWw3w · 634:2090
```

When the Figma name legitimately differs from the React export, record the alias:

```tsx
// @figma RagOpsConsole · SlhonORmySdoSMTQgDWw3w · 879:4125 · alias-of RagOpsConsoleBody
```

The codebase itself is the distributed registry — `grep -rn "634:2090" frontend/src`
lands on the file; the MCP `search_design_system` by symbol name resolves the reverse.

## Resolution, both directions (no registry needed)

- **Figma → code:** a node changed — `grep` its node id across `frontend/src`, or search
  the code for its (bare) name; it equals the React export.
- **code → Figma:** read the file's `@figma` header for the node id, or call the Figma
  MCP `search_design_system`/`get_metadata` by the React symbol name — it resolves because
  the names are identical.

## What is automated vs. by-name

- **Tokens & icons are automated** (and keep parallel naming on purpose): `tokens:figma`
  (`scripts/figma-export.ts`), `tokens:check` (`scripts/token-drift-check.ts`),
  `figma-icons.mjs`. See `../tokens/FIGMA-SYNC.md`. Do not apply the name-contract to
  tokens — their join is a generated pipeline.
- **Components are by-name** (this document) because they have no such automation, so the
  name is the contract.

## Files

- `README.md` — this naming contract (the ruleset).
- `FIGMA-WORKFLOW.md` — the day-to-day Figma ↔ code procedure.
- `FRAMES.md` — the live top-level frame inventory (current vs. study vs. scaffolding).
- `DESIGN-SYSTEM.md` — the per-element build contract / definition-of-done.
- `FIGMA-SEED.md` — retired seed-buildout history (not the active runbook).
- `icons.json` — the durable Lucide/Phosphor glyph artifact (`scripts/figma-icons.mjs`).
