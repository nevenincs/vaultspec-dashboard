# Vaultspec Dashboard — Figma Design System (rewrite)

**Status:** in-build (2026-06-15). Full UX rewrite. The pre-existing frames in file
`SlhonORmySdoSMTQgDWw3w` (page "Components") are a **discardable template** — we are not
tethered to them or to the current React implementation. Every surface is redesigned for a
modern, cohesive, user-experience-first instrument. Designs drive code, not the reverse.

This document is the **build contract**: every element built in Figma must conform to it,
and every element is reviewed by a no-context UX front-end reviewer before it is "done".

---

## 0. Definition of done (per element)

An element is DONE only when ALL hold:
- **Standardised** — composed from the shared component kit (§5), never one-off.
- **Centralised colour** — every fill/stroke/text bound to a palette variable (§2). Zero raw hex.
- **Tokenised** — type, spacing, radius, elevation from the scales (§3). No magic numbers.
- **Cohesive** — reads as one system with its siblings (same idioms, rhythm, density).
- **Reviewed** — passed a no-context UX front-end reviewer sub-agent (judges from screenshot
  alone, no knowledge of intent); findings incorporated or explicitly waived with reason.
- **Verified** — screenshot captured in Light (and spot-checked Dark) after build.

## 1. Principles (inherited project rules — binding)

- **Warmth lives in tokens, not decoration.** Warm low-chroma paper neutrals + ONE muted
  earthy accent (green). No gradients, no textures, no skeuomorphism, no second accent.
  Contrast / diff-legibility / density / reactivity override warmth on any conflict.
- **Clean instrument register.** This is a precision tool for a "second brain" knowledge
  graph, not a consumer toy. Calm, dense-but-legible, confident. Think Linear × Obsidian ×
  a pro audio tool.
- **Two icon families.** Lucide = invisible structural chrome. Phosphor (or in-family on
  Phosphor's grid) = expressive/domain marks. Every domain mark legible by shape at 14px.
- **Themes are remaps of one semantic tier.** Light / Dark / High-Contrast are peer modes
  of the Semantic collection; no element is theme-aware.

## 2. Colour — the palette (Figma variables, already created in-file)

- **Primitives** (collection, mode "Value"): `neutral/0..980`, `accent/300..800 + dark-subtle`,
  `tier/*`, `diff/*`.
- **Semantic** (collection, modes Light / Dark / High Contrast):
  - role tier: `surface/{base,raised,sunken}`, `border/{subtle,strong}`,
    `accent/{base,hover,pressed,subtle,on-subtle}`, `focus/ring`, `ink/{faint,muted,body}`.
  - `chrome/*`: `paper`, `paper-raised`, `paper-sunken`, `paper-aged`, `ink-faint`,
    `rule-strong`, `accent`, `accent-subtle`, `accent-text`, `focus`, `state-live`,
    `diff-add`, `diff-remove`.
  - `scene/*` (PENDING create on next write-window): `canvas-bg`, `ink`, `ink-muted`, `rule`,
    `tier-{declared,structural,temporal,semantic}`, `state-{active,complete,archived,stale,
    broken}`, `status-{provisional,graded,tiered}`.
- Source of truth: `frontend/tokens/figma/tokens.json`. Never invent colours; if a need has
  no token, that is a palette gap to add upstream, not a raw hex.

## 3. Type / spacing / radius / elevation (to formalise as Figma styles/vars)

- **Type** (Inter for chrome; JetBrains Mono for code/paths/ids):
  - `display` 20/28 SemiBold · `title` 15/22 SemiBold · `body` 13/20 Regular ·
    `body-strong` 13/20 Medium · `label` 12/16 SemiBold · `meta` 11/14 Regular ·
    `caption` 10/14 Regular · `mono` 11/16 JetBrains Mono.
- **Spacing** (4-base): 2, 4, 6, 8, 10, 12, 16, 20, 24, 32.
- **Radius**: `xs` 4 · `sm` 5 · `md` 7 · `lg` 10 · `pill` 999.
- **Elevation** (soft, warm-tinted, low): `flush` none · `raised` y1 b2 / 8% ·
  `overlay` y6 b18 / 14% · `popover` y10 b30 / 18%. No hard black shadows.

## 4. Figma file organisation (Page 1, left→right bands; current frames are scratch)

1. **Foundations** band — colour board, type ramp, spacing/radius/elevation, icon sheet.
2. **Kit** band — the component primitives (§5), each as a tidy spec frame with variants/states.
3. **Surfaces** band — full screens composed from the kit (§6).
4. **Graph** band — the node-graph visual language (§7).
Naming: `kit/<Component>`, `surface/<Screen>`, `graph/<Spec>`. Selection states shown explicitly.

## 5. Component kit (centralised primitives — build FIRST)

Each with its real states (default / hover / active / selected / disabled / focus-ring) and,
where relevant, sizes. All colour bound; all metrics tokenised.

- **Button** — primary (accent), secondary (paper-raised + border), ghost, danger; sizes sm/md.
- **IconButton** — 20 & 24, ghost + active pill (the rail's ★/◐/⚙ pattern, standardised).
- **SegmentedToggle** — the vault/tree/code idiom, generalised (2–4 segments, icon+label).
- **Input / SearchField** — leading icon, placeholder, focus ring, clear affordance.
- **Chip / Tag** — `#feature` tag, filter chip (removable), count badge.
- **ListRow** — the DocumentRow idiom: leading marker slot, name, meta, trailing; +selected
  treatment (accent-subtle bg + accent left bar) — ONE selected at a time.
- **TreeRow** — disclosure chevron (▸ collapsed / ▾ expanded), indent guides, leaf vs parent.
- **StatusMark set** — doc-type marks (research/adr/plan/exec/audit/index/code), tier marks,
  plan rollout circles (✓ complete / ◐ in-progress / ○ not-started), live dot, git-dirty dot.
- **Panel / Card** — paper-raised surface, header bar, body, soft elevation, radius lg.
- **HeaderBar / SectionHeader** — title + actions; collapsible variant.
- **Tabs** — underline/segment tab bar (right rail: now/work/changes/search).
- **Tooltip / HoverCard** — the node hover card, standardised.
- **Menu** — context menu + command-palette row (icon, label, shortcut, submenu caret).
- **Dialog / Modal** — scrim, panel, header, footer actions.
- **Scrollbar / Divider / KeyHint (kbd)** — small shared atoms.

## 6. Surface corpus (screens — compose from kit)

- **AppShell** — full 3-zone layout (left rail · stage · right rail) + top affordances; the
  master frame that proves cohesion end-to-end.
- **LeftRail** — DONE (vault / tree / code modes). Re-bind icons to scene/* on next pass.
- **RightRail (Activity)** — tab bar: Now (live strip + ops + inspector) / Work (pipeline step
  tree) / Changes (diff overview) / Search (semantic). Designed degraded states.
- **Stage** — the graph canvas chrome (the graph itself is §7): zoom/LOD control, breadcrumb
  scope, empty/loading/degraded states.
- **Timeline** — relational phase-lane arc timeline; range select; playhead.
- **Filtering UI** — GROUND-UP REWRITE (§8).
- **CommandPalette** — fuzzy, grouped, keyboard-first.
- **ContextMenu**, **Dialog/Settings**, **DiffView**, **Discover (semantic search)**,
  **Minimap / MinimapWidget**, **NodeInterior**, **HoverCard**, plus overlay states
  (CanvasState, Island, RepresentationMode, RangeSelect, KeyboardNav cheatsheet).

## 7. Graph UI — the node-graph visual language (design the GRAPH, not HTML)

The centrepiece. A "second brain" constellation of vault documents. Design the actual visual:
- **Nodes** — by doc-type (Phosphor domain mark), sized by salience/degree, coloured by TIER
  (`scene/tier-*`), with a grayscale status stamp (state/plan). LOD: at constellation zoom →
  feature clusters (labelled halos); mid zoom → doc nodes w/ marks; close zoom → node interior
  (title, tier ring, status). Selected = accent focus ring + raised; hover = bloom + HoverCard.
- **Edges** — by relation/tier: declared (solid ink-faint), structural (accent-ish),
  temporal (warm dashed), semantic (violet `tier-semantic`, faint). Meta-edges between feature
  clusters are heavier. Direction via subtle taper, not arrowheads where avoidable.
- **Field** — warm `scene/canvas-bg`, faint `scene/rule` grid/vignette; no gradients.
- **Affordances** — minimap, zoom/LOD, scope breadcrumb, legend, density control.
- Deliver as Figma frames: a constellation view, a mid-zoom view, a node-interior spec, an
  edge/legend sheet, hover/selected states.

## 8. Filtering UX — ground-up rewrite (ignore the existing FilterSidebar entirely)

The current filtering UX is rejected. New model, designed for the knowledge-graph workflow:
- **One coherent filter surface**, not scattered toggles. A composable **query builder**:
  facet chips (doc-type, tier, feature, lifecycle-state, date range, has-edges) that combine
  as removable chips in a single filter bar, with a clear active-filter summary and one-click
  reset.
- **Live result count** as you compose (e.g. "142 → 18 nodes"). Filtering narrows the
  already-loaded set; it never feels like a round-trip.
- **Saved views / presets** (e.g. "stale plans", "this feature's lineage").
- **Scoped to the active surface** (graph / tree / table) and reflected visually there
  (dimming non-matches, not hiding — preserve context).
- Designed empty/over-filtered state ("no nodes match — relax a facet"). Keyboard-composable.

## 9. Review gate

Per element: build → screenshot → fresh **no-context UX front-end reviewer** sub-agent
(judges hierarchy, legibility, spacing rhythm, affordance clarity, state coverage, cohesion
with siblings — purely from the image, no intent given) → incorporate findings → re-verify.
Track findings; nothing ships "done" without a pass.
