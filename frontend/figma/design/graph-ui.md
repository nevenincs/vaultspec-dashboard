# Graph UI — the node-graph visual language

Design the GRAPH, not HTML. This is the centrepiece: a "second brain" constellation of vault
documents (research/adr/plan/exec/audit/index/code) and the features that converge them. The
goal is an instrument you can *read* — tier, type, status, and relation legible at a glance,
calm at rest, expressive on focus. Warm, dense, precise. (Linear × Obsidian × star chart.)

## Field (the canvas)
- Background `scene/canvas-bg` (warm near-white / deep warm-black in dark). No gradient.
- Faint `scene/rule` vignette only; optional 1px dot-grid at very low contrast for depth.
- Selection/hover never changes the field — only the marks respond.

## Node anatomy (read inside-out)
- **Glyph** — the doc-type domain mark (Phosphor): research=Pencil, adr=Diamond, plan=Clipboard,
  exec=Play/▶, audit=SealCheck, index=List, code=TreeStructure. Legible by shape at 14px.
- **Tier colour** — the node body/ring is coloured by TIER (the relationship's authority):
  declared `scene/tier-declared`, structural `scene/tier-structural`, temporal
  `scene/tier-temporal`, semantic `scene/tier-semantic`. Tier is the ONE hue carrier.
- **Status stamp** — a small grayscale stamp on the node communicates lifecycle/plan-state
  WITHOUT a second hue: complete=filled, in-progress=half, not-started=ring, stale=dotted ring
  (`scene/state-stale` is the only warm exception), broken=`scene/state-broken` slash.
- **Salience** — node SIZE encodes degree/importance (links in+out). Range ~10–34px.
- **Label** — title below the node, Inter Regular 11 `scene/ink`, shown by LOD (see below);
  truncated with ellipsis, full title in the HoverCard.

## Edge taxonomy (relation legible without arrowheads)
- **declared** — solid hairline `scene/ink-muted` (the structural backbone).
- **structural** — solid, slightly heavier, `scene/tier-structural`.
- **temporal** — warm dashed `scene/tier-temporal` (time/lineage).
- **semantic** — faint violet `scene/tier-semantic`, thin (inferred similarity; recedes).
- **meta-edges** (feature↔feature at constellation LOD) — heavier, bundled.
- Direction via subtle source→target taper + slight opacity gradient, not arrowheads (keeps
  the field calm). Edge opacity drops when not incident to hover/selection.

## LOD (semantic zoom — three legible tiers)
1. **Constellation (far)** — nodes collapse into **feature clusters**: a labelled soft halo
   (`accent-subtle` wash) sized by member count, feature name in `title` scale, meta-edges
   between clusters. The whole vault as a star map. Bounded, never the raw million-node field.
2. **Mid** — clusters open into doc nodes with glyph + tier colour + status stamp; labels on
   hover or for high-salience nodes; intra-feature edges shown.
3. **Close (node interior)** — the focused node expands to a card: title, tier ring, status,
   doc-type, feature tag, key relations list. This is the `NodeInterior` spec.

## Interaction states (all designed as frames)
- **Rest** — calm; labels only on salient nodes; edges at low opacity.
- **Hover** — node *blooms* (slight scale + raised ring `focus/ring`), its edges + neighbours
  lift to full opacity, others dim; `HoverCard` appears (title, type, tier, status, rollout).
- **Selected** — persistent `focus/ring` + neighbourhood lift; opens NodeInterior / inspector.
- **Filtered** — non-matches drop to ~12% (dim-not-hide, per filtering-ux.md); shape preserved.
- **Live delta** — a newly-added node/edge fades in with a brief `chrome/state-live` pulse;
  removed fades out. (No layout thrash — settle, don't relayout violently.)
- **Degraded** — if a backend tier is unavailable, affected nodes render in a designed
  "unknown" treatment (hollow, `ink-faint`), never an error.

## Affordances (chrome around the field — from the kit)
- **Minimap** (bottom-right): bounded overview + viewport rect; click-to-jump.
- **Zoom / LOD control**: stepper tied to the three LOD tiers + fit-to-view.
- **Scope breadcrumb** (top-left): `vault › #feature › document`.
- **Legend** (toggleable): tier colours, edge types, status stamps — the reading key.
- **Density / label control**: toggle label density; toggle edge types on/off.

## Figma deliverables (frames to build under the `graph/` band)
1. `graph/Constellation` — feature-cluster star map + meta-edges + legend.
2. `graph/Mid` — doc nodes, all four edge types, hover state shown on one node.
3. `graph/NodeInterior` — the close-LOD node card spec.
4. `graph/Edges+Legend` — edge taxonomy + status-stamp + tier swatch key sheet.
5. `graph/States` — rest / hover / selected / filtered / live-delta / degraded, side by side.
All nodes/edges colour-bound to `scene/*`; reviewed by the no-context UX reviewer for: can you
read tier vs type vs status without a legend after a glance? is the field calm at rest and
expressive on focus? does the LOD story hold?
