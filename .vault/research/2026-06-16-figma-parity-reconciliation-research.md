---
tags:
  - '#research'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
related: []
---

# `figma-parity-reconciliation` research: `Figma design parity and reconciliation`

A design agent is authoring a binding design system and the dashboard surfaces in the
Figma file `SlhonORmySdoSMTQgDWw3w` (Foundations/Colour, Foundations/Type & Metrics, a
component Kit, the surface frames, and the headline `graph/*` frames). The directive is
that the Figma is now the binding source of truth and the local codebase must be
reconciled to it: where code matches it stands, where code diverges it is corrected,
and where the designs imply a backend capability the engine lacks, that capability is
built. This research catalogs the parity gap per surface and across the engine wire so a
reconciliation ADR can decide the actions and sequence. It was grounded by two read-only
audits (the design-system token/type/metric layer, and the engine/stores wire) plus the
firsthand state of the surfaces already restyled to the designs this cycle.

## Findings

### F0 — Governance conflict: who is the source of truth (must be settled first)

The directive "Figma is binding" directly contradicts two standing project artifacts:
the codified rule `themes-are-oklch-generated-from-a-token-tier` and the repo doc
`frontend/tokens/FIGMA-SYNC.md`, both of which assert the inverse — code is canonical and
Figma is a one-way mirror. The design agent has also centralized constants into Figma and
a new rule `design-system-is-centralized` was added mid-cycle. These cannot all hold at
once. The reconciliation ADR must explicitly settle the direction of authority, and it
may need to do so **per token family** (see F1: color already flows code to Figma through
a real generator; type/radius/elevation have no pipeline at all). Until this is settled,
every downstream reconciliation is ambiguous about which side moves.

### F1 — Design-system foundation: spacing and color match; type, radius, elevation diverge as whole taxonomies

Only color has a real DTCG to Style-Dictionary to CSS pipeline (authored under
`frontend/tokens/`, generated into the marked regions of `frontend/src/styles.css`,
mirrored to `frontend/tokens/figma/tokens.json`). Type, spacing, radius, and elevation
are hand-authored Tailwind v4 `@theme` variables in `frontend/src/styles.css` with no
DTCG source, no generator, and no Figma mirror — so their parity is a manual, drift-prone
contract.

| Family | Verdict | Delta (Figma binding to code) | Reconciliation + blast radius |
| --- | --- | --- | --- |
| Spacing | MATCH | 4-base 2,4,6,8,12,16,24,32 identical (code `--spacing-vs-*`) | None on values; optional name map |
| Color | MATCH | OKLCH primitives to semantic tier present; 8 `scene/category-*` node colors added this cycle | None |
| Type | DIVERGENT | Code `text-*` is a px-purpose scale, not Figma's display/title/body/body-strong/label/meta/caption/mono role names; Figma `display 20/28` and `label 12/16` have no code role; `meta` line-height differs (16 vs 14); mono size differs (code 12-13 vs Figma 11) | Rename taxonomy + add roles: ~309 `text-*` usages across 49 files |
| Radius | DIVERGENT | Figma xs4/sm5/md7/lg10/pill18 vs code sm4/md6/lg10/xl14; `pill 18` missing (code uses native `rounded-full`); md is 6 not 7 | Re-key + retune + add pill: ~137 `rounded-vs-*` + ~30 `rounded-full` across ~50 files |
| Elevation | DIVERGENT | Figma 3 levels raised/overlay/popover vs code 6 flat/card/panel/float/dialog/deep | Collapse 6 to 3 + per-theme remap rewrite: ~30 usages across 24 files |
| Font family | DIVERGENT (deliberate) | Figma binds Inter + JetBrains Mono; code uses a system stack with an explicit in-code rationale ("no bundled identity face for a web-served tool") | ADR decides: adopt the fonts or record code's choice as a sanctioned deviation |
| Non-color pipeline | MISSING | Type/spacing/radius/elevation have no generator or Figma mirror | Extend `tokens/` + Style Dictionary to the 4 families so parity is mechanical, not policed |
| Kit components | PARTIAL | Shared chrome kit is thin (`frontend/src/app/chrome/` only); most controls are ad-hoc Tailwind compositions per feature | Reconcile against the Figma Kit; build-vs-inline per component |

A name-collision hazard: code's own `text-title` is 13px, but Figma `title` is 15/22
(maps to code `text-heading`) — a migration that renames carelessly will mis-bind. The
audit recommends sequencing the migrations by blast radius (elevation ~30, then radius
~167, then type ~309), each a `@theme` rename behind a mechanical class sweep.

### F2 — Engine/backend wire: strong parity; two genuine gaps

Contrary to the worry that backend features are broadly missing, the engine is in strong
parity with what the designs imply. The two capabilities most likely assumed missing are
both fully present: per-node **category** and **salience** are engine-served (salience is
a real CPU Degree-of-Interest projection — personalized PageRank, betweenness, k-core,
recency, lifecycle — attached to the graph node payload and used to size the canvas
circles), and the multi-mode **layout catalog** (Network/Tree/Layered/Radial/Communities/
Grouped/Timeline) is a set of client spatializations over the one served graph, needing
no per-mode wire data (the semantic UMAP mode is client-gated but its `/graph/embeddings`
backend exists). Discover (rag-backed %match), `/vault-tree` (now carrying plan
`progress`), and the settings schema (`confidence_floor` + `label_filter`, served and
consumed) are all SERVED.

Two real gaps:

- **Historical / committed text diff is MISSING.** The working-tree structured diff is
  fully served and wired (the read-only `git diff` ops pass-through to the diff browser).
  But the engine's own `/graph/diff` is a graph-delta log (node/edge add/remove/change),
  not a line/hunk text diff, so diffing arbitrary commit ranges or `.vault` document
  content across history has no engine route. The design's "diff unavailable — engine
  capability pending" state is therefore a legitimately reserved degraded state, not a
  bug. Reconciliation, if the design requires historical diffs, is a new bounded
  read-only route (a two-rev `git diff`, or a blob-pair diff over the git object DB) —
  pure read-and-infer, no vault writes. **Confirm the design's diff scope before
  building; the working-tree case is already complete.**
- **Node-evidence shape is PARTIAL.** The evidence projection item shapes diverge from
  the GUI type (documents are bare stems vs path+doc_type; code locations carry the wrong
  field name; commits lack a subject). The engine already self-flags this as a contract
  event. Reconciliation is a low-risk read-and-infer enrichment of the evidence
  projection needed for a complete HoverCard/Inspector.

All reconciliation here stays within `engine-read-and-infer` (no vault writes, no ref
mutation).

### F3 — Surfaces: built to the designs this cycle, with two recorded divergences

The left rail (vault/code/tree, with the new tree mode and full-stack plan-status pips),
the right activity rail, the stage chrome, the timeline, the overlays, settings, and the
command palette were all restyled to their binding frames this cycle and committed
gate-green, verified in the running app. Two divergences from prior decisions were taken
deliberately and need formal reconciliation, not silent overwrite:

- The right rail's tab information architecture became `Inspect | Work | Search | Changes`
  with the liveness pillars promoted to a persistent header, per the binding frame — this
  contradicts the accepted `dashboard-activity-rail` ADR (`now | work | changes | search`,
  work-second). The reconciliation ADR should amend or supersede that ADR.
- The headline canvas restyle (category circles, flat grey edges) deliberately supersedes
  the node-visual-richness silhouette marks and the tier-edge color encoding on the
  canvas (the data is retained; only the canvas visual changed). These are codified
  features whose rules need amendment.

### F4 — Headline GraphNode canvas: in parity; the controls redesign resolved a prior conflict

The canvas was restyled to the binding `graph/Hero` and `graph/Node-items` — category
colored circles sized by the engine-served salience, labels, three states
(default/selected/filtered-out), flat grey edges — and the controls were consolidated to
the plain-language `graph/Controls` (Navigate / Layout Network·Tree·Grouped·Timeline /
Zoom / Tune Spacing·Connection-reach·Clustering). The Tune knobs map cleanly onto the
real d3-force driver, which resolved a previously-flagged conflict where the old
AlgorithmPanel exposed knobs the driver lacked. Backend parity for this surface is
confirmed by F2 (category + salience are engine truth). Residual: the `center`/gravity
force knob has no plain-language control slot (a UI gap, not a backend gap).

### F5 — Code Connect cross-mapping: the live file's components are Kit primitives, not the screens

The cross-mapping must run through the `@figma/code-connect` CLI, not the MCP Code Connect
tools (the latter return an Org/Enterprise plan gate on this Pro seat; the CLI + a
personal access token authenticates and reaches node validation — proven this cycle, and
codified as the `figma-code-connect-via-cli` rule). The decisive structural finding: Code
Connect publish requires each target to be a `COMPONENT` or `COMPONENT_SET`, and in the
live file those are the **design-system Kit primitives** (a `TreeRow`, `Chip`, `Card`,
`Switch`, `Slider`, `SearchField`, `SegmentedToggle`, `LeftRail`, `ActivityRail`,
`Timeline`, `DocRow`, `ProgressBar`, `MenuRow` set), not the composed-screen frames
(CommandPalette, SettingsDialog, Stage, etc. are plain frames and are invalid publish
targets). Thirteen code components mapped cleanly to Kit primitives and the dry-run
publish is valid with zero errors; the registry (`frontend/figma/component-map.json`) was
repointed off the retired seed file to the live file. Reconciliation: the durable mapping
is code-component to Figma-Kit-primitive; composed screens either get authored as Figma
components or stay unbound. Publishing is held pending this pipeline's plan approval.

### Reconciliation action menu (for the ADR to decide and sequence)

1. Settle source-of-truth direction, per token family (F0) — the gating governance call.
2. Metrics taxonomy migration: type, radius, elevation renamed/retuned to the Figma
   foundation, sequenced by blast radius (F1).
3. Close the non-color token pipeline so type/spacing/radius/elevation are generated and
   mirrored like color (F1).
4. Font-family decision: adopt Inter/JetBrains or sanction the system stack (F1).
5. Kit reconciliation: map code components to the Figma Kit primitives; decide build-vs-
   inline for gaps (F1/F5).
6. Engine: confirm the diff scope and, if needed, add a bounded historical text-diff route
   (F2); enrich the node-evidence projection (F2).
7. Amend the affected ADRs/rules: `dashboard-activity-rail` tab IA, the node-visual-
   richness canvas marks, and the tier-edge encoding (F3).
8. Finish and publish the Code Connect cross-map against the Kit primitives (F5).

### Open questions for the ADR

- Does the binding DiffView require historical/committed diffs, or is working-tree only
  sufficient (decides whether F2's largest engine item is in scope)?
- Per family, does Figma win or does code's deliberate choice stand (fonts, elevation
  level count)?
- Are the composed-screen surfaces meant to become real Figma components (for Code
  Connect), or do they stay unbound while only Kit primitives map?
