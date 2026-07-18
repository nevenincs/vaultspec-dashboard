---
tags:
  - '#adr'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-07-18'
related:
  - "[[2026-06-12-dashboard-foundation-research]]"
  - '[[2026-07-18-dashboard-gui-research]]'
---
# `dashboard-gui` adr: `dashboard GUI architecture` | (**status:** `accepted`)

Migrated from the kickoff working set (`tmp/kickoff/`) on 2026-06-12; this
is the stamped record.

Authored by experience-architect on team vaultspec-kickoff-specs. Source of
truth for what is decided/leaning/open:
`2026-06-12-dashboard-foundation-research` (the ideation brief). The
engine↔GUI contract lives in `2026-06-12-dashboard-foundation-reference` and
is referenced, not duplicated, here.

Research basis: three delegated surveys (graph-visualization literature; GPU
graph-renderer landscape; frontend stack/delivery), synthesized in §11. Claims
below that lean on them cite §11 inline.

______________________________________________________________________

## 1. Design stance

Three commitments frame every decision below:

- **The graph is the product.** Visual browsing of the second brain is the
  headline feature; the other regions exist to scope it, contextualize it, and
  act on what it reveals. Engineering and design budget skews accordingly.
- **Truthfulness over polish.** Edges carry provenance tiers and confidence;
  the UI must never flatten that into uniform lines, and must render
  degradation (rag down, structural links broken, temporal data sparse) as
  legible states, not as errors or silent absence.
- **Conventional skeleton, distinctive skin.** Layout follows the converged
  agentic-desktop idiom (Claude desktop, Codex desktop, Antigravity) so it is
  instantly legible; identity comes from a custom hand-drawn, illustrative
  visual language (§7). The layout is not where we innovate.

The anti-goal, named once so it governs everywhere: **the hairball.** Every
graph-stage decision in §3 exists to prevent the failure mode where the vault
renders as an undifferentiated ball of dots and lines. The literature is clear
that overview-first breaks down on dense multivariate graphs; we design
details-first, expand-on-demand (§3.2, §11.1).

## 2. Window anatomy

Four regions in the converged idiom — three vertical panes plus a bottom rail:

```
┌────────────┬──────────────────────────────────┬─────────────┐
│  LEFT      │  CENTER — THE STAGE              │  RIGHT      │
│  scope     │                                  │  activity   │
│            │  GPU graph: the second brain     │             │
│  worktree  │  (feature constellations →       │  git status │
│  picker    │   documents → interior detail)   │  in-flight  │
│  ──────    │                                  │  core/rag   │
│  vault     │  [filter bar docked at top]      │  status     │
│  browser   │                                  │  ──────     │
│            │                                  │  inspector  │
├────────────┴──────────────────────────────────┴─────────────┤
│  TIMELINE — movie idiom: lanes, zoom, playhead       ▶ LIVE │
└──────────────────────────────────────────────────────────────┘
```

Both side rails collapse; the timeline collapses to a slim strip (events as a
sparkline + playhead) rather than disappearing entirely — time is a dimension
of the product, not a panel. A command palette (Ctrl/Cmd-K) fronts navigation,
search, and operational verbs; it is the cheap escape hatch that keeps the
chrome minimal.

### 2.1 Left — orientation and scope

Responsibility: answer "where am I pointed?" and set the stage's scope.

- **Worktree picker** at top: the engine's repository → branch → worktree
  mapping, rendered as a compact switcher (current worktree always visible;
  expand for the mapped landscape). Worktrees that contain a vault corpus are
  primary; bare branches render dimmed, as context. Switching worktree swaps
  the stage's scope wholesale — it is the coarsest filter.
- **Vault-scoped file browser** below: a tree over the vault corpus only
  (`.vault/` subtree groups: research / adr / plan / exec / audit / reference /
  index), each entry showing doc type glyph, feature tag, and freshness.
  Selecting a document focuses its node on the stage (and vice versa —
  selection is bidirectional). This is the boring, reliable entry path for
  users who think in files; the stage is for users who think in features.
- The browser is read-only in v1 (the brief's scope boundary: no authoring).

### 2.2 Center — the stage

The graph. Specified fully in §3. The filter bar (§3.5) docks at the stage's
top edge because filters are stage-scoped state shared with the timeline; it
is part of the instrument, not global chrome.

### 2.3 Right — activity rail

Responsibility: "what is happening / what just changed," and the inspector.

- **Now strip** (top): git status for the current worktree — modified files,
  staged set, branch ahead/behind — plus vaultspec-core's in-flight status and
  the rag service rollup (service/watcher/index/jobs/GPU). Each backend's
  degraded state renders honestly: stopped, crashed, absent (§7.4 gives these
  states their illustrations). Operational verbs (start/stop service, reindex,
  watcher tuning, vault check) live here as buttons-with-confirmation — the
  pillar-2 control surface, deliberately modest.
- **Inspector** (bottom, contextual): when a node/edge/timeline event is
  selected, its detail renders here — document metadata, content preview,
  resolved code locations with resolution status, correlated commits, and the
  per-tier edge list. The inspector is where "node as a live lens" pays off in
  prose form; the stage shows the shape, the inspector shows the evidence.
  *Deviation (2026-06-13, flagged at the W03.P10 review, finding 027):*
  **content preview is deferred from v1** — the agreed contract's evidence
  capability carries document paths and types but no content/excerpt field,
  so a body preview is unimplementable at the agreed capability level. The
  remedy is filed as a contract wishlist item (an excerpt field on the
  evidence capability, owner: engine seam); the preview returns to inspector
  scope when that capability lands. All other inspector responsibilities in
  this section shipped as specified.
- **Search** (pillar 3) is reached via the command palette or a rail tab:
  query input with the rag filter vocabulary as typed chips, results listed
  with score and source, each result clickable into the graph (focus node) or
  into the inspector (code/doc preview). Search transits the engine's
  `/search` pass-through, which annotates each result with its graph node id
  (contract §8) — that annotation is what makes results clickable into the
  stage. When rag is down, the control degrades to title/text match over the
  graph (the graph filter's text-match facet) with an explicit "semantic
  search offline" state — never a dead control.

### 2.4 Bottom — timeline

Specified fully in §4. Bottom placement is confirmed (the movie-editing idiom
the brief leans to; it is also where the converged desktop layout has spare
vertical room).

### Proposed decisions — §2

- Four-region layout fixed: left scope rail, center stage, right activity
  rail, bottom timeline; rails collapsible, timeline collapses to a strip.
- Command palette (Ctrl/Cmd-K) as the universal navigation/verb surface.
- Selection is one shared concept across browser, stage, timeline, and
  inspector — selecting anywhere focuses everywhere.
- Inspector lives in the right rail (no modal document viewers); search is a
  rail tab + palette flow, not a fourth pane.
- Left browser is vault-scoped and read-only in v1.

## 3. The graph stage

### 3.1 What a node is

Per the brief, the convergence is the entity: a **feature** exists as the
cluster of relations among its research, decisions, plans, execution records,
and audits. The stage therefore has two node species:

- **Feature nodes** (convergence points) — the default population of the
  stage. A feature node is synthesized by the engine from the feature tag plus
  its declared cross-reference cluster. Documents are evidence attached to it,
  reachable by descent.
- **Document nodes** — revealed when a feature is opened; typed by directory
  (research / adr / plan / exec / audit / reference).

**Node visual anatomy** (the custom node interface — ours, regardless of
renderer):

- *Silhouette:* hand-drawn glyph per type — one recognizable organic shape per
  doc type, a distinct compound shape for features. Shape carries type; color
  is reserved for state (see §7.3) so the two channels never compete.
- *Progress:* features and plans wear a sketched progress ring (plan 7/12
  steps done → ring 58% inked). Lifecycle state (active / complete / archived)
  modulates fill treatment: active = inked, complete = settled/solid, archived
  = pencil-faded.
- *Freshness:* recency of last modification as a subtle halo/saturation decay
  — the network visibly "cools" where work stopped.
- *Tier badges:* small per-tier degree counts (e.g. ◆3 ▣5 ◷2 ≈14) so a node
  advertises how much context it can unfold per provenance tier without
  fetching it. Supplied by the engine's degree-count metadata (contract §4).
- *Label:* title, shown by degree-of-interest — always for selected/hovered/
  pinned and high-DOI nodes, density-culled elsewhere.

LOD discipline: full anatomy renders only above a zoom threshold and for
focused nodes; the zoomed-out field draws silhouette + state color only.
Rich-but-distant is how hairballs are born.

### 3.2 Interaction model: details-first, expand on demand

The stage never loads the whole corpus into view. The model is
**search/scope → show context → expand on demand** — van Ham & Perer's
degree-of-interest pattern (TVCG 2009, §11.1), the strongest evidence-backed
anti-hairball primitive in the literature; the visible subgraph is always
bounded by a DOI budget (focus + tier-weighted interest + distance), so node
count stays bounded regardless of corpus size:

- **Initial view:** the feature constellation for the scoped worktree —
  dozens of feature nodes, not thousands of documents. Layout: force-directed
  with pinned stability (§3.4).
- **Hover:** ego-highlight — the node and its 1-hop neighborhood lift; the
  rest of the field recedes (dims, doesn't hide). Tooltip shows title +
  one-line state.
- **Click:** select. Inspector populates; timeline highlights the node's
  events; selection syncs to the file browser.
- **Open (double-click / expand affordance):** the node unfolds *in place*:
  - Feature node → its document lifecycle as an interior cluster, with typed
    directed edges (audit —reviews→ exec —fulfills→ plan —implements→ adr
    —resolves→ research) laid out along the lifecycle axis, so every opened
    feature has the same legible internal grammar.
  - Plan node → interior structure: waves/phases/steps with check state;
    exec records dock to their steps. (Engine contract: node-expansion call.)
  - Opened nodes are rendered as **DOM overlay islands** above the GPU field
    (§6) — full HTML richness where it matters, GPU economy everywhere else.
- **Expand ego (keyboard `E` / context menu):** pull one more hop of the
  selected node's neighborhood into view, tier filters respected. Repeated
  expansion grows a working set; `Backspace` collapses; "clear to
  constellation" resets.
- **Discover (context menu):** run node-scoped semantic discovery (engine →
  rag). Candidate edges arrive visually *quarantined* — sketchy, translucent,
  question-marked — and never join the persistent graph unless the user pins
  them for the session. Probabilistic suggestions must look like suggestions.
- **Pin:** any node can be pinned (layout-fixed + always-labeled); pins
  persist per workspace.

The working set (what's currently materialized on stage) is explicit state —
shown as a small breadcrumb/chip trail above the stage, each chip removable.
The user can always answer "why is this node on my screen?"

### 3.3 Edges: typed, directed, tiered

Four provenance tiers, four fixed line treatments (stable across the whole
product — this encoding is part of the visual language, §7.3):

| Tier       | Treatment                                         | Direction              | Confidence             |
| ---------- | ------------------------------------------------- | ---------------------- | ---------------------- |
| Declared   | solid inked line                                  | arrowhead + verb label | n/a (authoritative)    |
| Structural | drawn line, status-colored: resolved/stale/broken | arrowhead              | binary + status        |
| Temporal   | dotted line                                       | flow gradient          | opacity by confidence  |
| Semantic   | soft translucent stroke ("haze")                  | none (associative)     | opacity/width by score |

- Relation verbs (fulfills, implements, resolves, reviews…) render as edge
  labels only at high zoom or on hover/selection — never in the wide view.
- Structural status is signal, not noise: broken edges render in the warning
  hue and are queryable ("show me everything broken") via the filter bar.
- Confidence encoding avoids known channel interference (Guo, Huang & Laidlaw,
  TVCG 2015, §11.1): since tier identity rides line *treatment* (with hue
  secondary), confidence renders as **lightness/grain**, not transparency-only
  — transparency measurably degrades hue reading, and fuzziness degrades width
  reading. The semantic tier's "haze" is a textured light stroke, not an
  alpha fade.
- Per-edge tier breakdown is collapsed by default and **unfolds on
  hover/selection** (the "Unfolding Edges" pattern, Bludau et al. CGF 2023,
  §11.1) — context on demand instead of always-on clutter.
- **No edge bundling on the working layer.** Bundling measurably degrades
  path-tracing accuracy (AVI 2012 study, §11.1), and "is A actually linked to
  B" is our user's core question. At constellation level, inter-feature edges
  *aggregate* into a single meta-edge ribbon (thickness = count, tier
  breakdown on hover) — aggregation with recoverable structure, which is not
  bundling. No per-edge rendering between closed clusters. **Aggregation is
  engine-side** (contract §4): feature-level queries return meta-edges
  `{count, breakdown_by_tier}`; the GUI never flattens doc-level edges
  client-side to draw the constellation — doc-level edges arrive on descent.
- Recurring vault motifs collapse into expandable glyphs (motif
  simplification, Dunne & Shneiderman CHI 2013, §11.1): a plan fanning into
  many exec records renders as one fan glyph with a count until opened.

### 3.4 Layout and stability

- Force-directed for the constellation and ego views — **ForceAtlas2**
  (Jacomy et al. 2014, §11.1), purpose-built for scale-free networks of
  10–10,000 nodes, continuous (so it re-stabilizes incrementally), run in a
  web worker (graphology's FA2 worker variant) — with **warm-start layout**:
  expanding/filtering perturbs only the local neighborhood. Mental-map
  preservation beats layout optimality: the measured benefit of layout
  stability is precisely for revisitation and path-following tasks
  (Archambault & Purchase 2013, §11.1) — re-finding the same document across
  interactions and scrubs, which is our dominant task.
- Opened-node interiors are *not* force-laid: lifecycle clusters use the fixed
  lifecycle axis; plan interiors use a tiered (wave/phase/step) layout.
  Structure that has a canonical order gets a canonical layout.
- Node positions for a given scope are cached per workspace so reopening the
  app restores the remembered map.
- **All view persistence is client-side.** Pins (§3.2), cached node
  positions, and named lenses (§3.5) persist in browser storage
  (IndexedDB/localStorage keyed by workspace + scope) — the engine is
  read-and-infer and holds no preference/layout store; nothing here is a
  contract surface.

### 3.5 Filtering UX

One filter model, two views (stage + timeline), engine-owned vocabulary
(contract §3 — the GUI enumerates legal values from the engine; nothing
hardcoded):

- **Tier dial** — the signature control: four tier toggles with per-tier
  confidence thresholds (semantic gets a slider). This is the user's
  trust dial: "show me only what's certain" ↔ "show me everything you
  suspect." It's rendered prominently, first in the filter bar.
- Facet chips: doc type, feature tag, relation verb, structural status,
  text match. Date range is set *on the timeline* (range-select) and shows
  in the bar as a chip — one temporal filter, owned by the timeline.
- Filters animate: filtered-out elements fade and shrink over ~200ms rather
  than popping, so the user sees *what* a filter removed. Filtered-out is
  also recoverable context: a count chip ("142 hidden") names the cost.
- Filter sets are saveable as named **lenses** (e.g. "broken links," "last
  sprint," "high-confidence only"); lenses appear in the command palette.

### Proposed decisions — §3

- Two node species: synthesized feature (convergence) nodes by default,
  document nodes by descent. The whole-corpus document view exists only as a
  deliberate lens, never the default.
- Details-first interaction: scoped constellation → hover ego-highlight →
  open-in-place → expand-on-demand; explicit, visible working set.
- Fixed product-wide tier encoding: declared=solid, structural=status-colored,
  temporal=dotted, semantic=translucent haze; semantic candidates are visually
  quarantined and session-pinned only.
- Canonical layouts for canonical structure (lifecycle axis, plan tiers);
  force-directed with warm-start stability and cached positions elsewhere.
- Tier dial as the primary filter control; engine-owned filter vocabulary;
  animated filter transitions; named lenses.

## 4. The timeline

The time axis of the same instrument — not a separate visualization. The
movie-editing idiom, committed: scrollable, zoomable, clickable, with a
playhead.

### 4.1 Anatomy

- **Lanes** (few, fixed): commits · document events (created/modified) · vault
  lifecycle events (steps checked, plans approved, features archived, audits
  filed). Lane count stays ≤4; heterogeneity is encoded per-event (type
  glyphs, the same hand-drawn glyph family as the stage), not per-lane.
- **Zoom = aggregation.** Zoomed out, events render as density buckets
  (sketched histogram bars per lane); zooming in resolves buckets into
  individual event marks. Bucketing is engine-supplied at coarse zooms,
  client-side at fine zooms (contract §5 settles the split). The timeline must
  never render ten thousand individual marks.
- **Playhead** with a LIVE position docked at the right edge. The timeline's
  default state is LIVE: now-anchored, streaming.
- Current filters apply: the timeline shows the events of the *filtered*
  graph, and the same lens names govern both.

### 4.2 Scrubbing: time drives the stage

- Dragging the playhead off LIVE puts the product into **time-travel mode**:
  the stage renders the network as it stood at T. Mode is unmistakable —
  stage tint shifts (paper "ages" slightly, §7), a "viewing {date} — return
  to live" chip docks on the stage, and all operational verbs (§2.3) disable.
- Mechanics: the client holds a **diff log** (graph deltas between times) for
  the loaded range and replays it locally during scrubbing — 60fps scrub with
  zero per-frame queries; full snapshot re-query only on jumps outside the
  loaded range. **Settled in the contract (its §5):** keyframe + diff
  (`/graph/asof` + `/graph/diff`), and the live `graph` SSE channel shares
  the same delta shape — liveness and scrubbing are one animation code path.
- **Time-travel shows three tiers.** Historical views serve declared +
  structural + temporal only; the semantic tier is present-only by design
  (suggestions about now, not history). In time-travel mode the tier dial
  renders semantic as inapplicable — a designed state, not a gap.
- Nodes/edges that don't exist at T are absent; nodes that exist but differ
  (plan half-executed) render their state *as of T* — the progress ring is
  time-dependent. Layout stays warm across scrub (positions don't reflow per
  frame; appearing nodes fade in at their cached/home position).
- **Range selection** (drag across the ruler) sets the date-range filter for
  both views and supports "play": animate the playhead across the range to
  watch the network grow — the cheapest, most legible "history of this
  feature" story in the product.
- Click an event mark → select it (inspector shows the commit/doc event) and
  pulse the corresponding node on stage.

### 4.3 Dependency note

Temporal fidelity rides on vaultspec-core's in-flight date-stamping mandate
(brief, "Temporal mapping"). The timeline ships regardless — commits and file
mtimes exist today — but lifecycle-lane richness tracks that landing. Degrade,
don't demand: sparse lanes render as sparse, with the empty-state explaining
why (§7.4).

### Proposed decisions — §4

- Bottom-docked movie-idiom timeline: ≤4 fixed lanes, zoom-dependent
  aggregation, glyph-coded heterogeneous events.
- LIVE-by-default; scrubbing enters an explicit, visually distinct time-travel
  mode that drives the stage's temporal state and disables mutation verbs.
- Client-side diff-log replay as the scrub mechanism — granted by contract
  (keyframe + diff, shared delta shape with the live stream); semantic tier
  inapplicable in time-travel, rendered as a designed state.
- Range-select on the timeline is the product's single date-range filter;
  range "play" animates network growth.

## 5. Frontend architecture

### 5.1 Delivery shape: decoupled web GUI, served by the engine — committed

The brief leans this way; I examined the alternative and commit to it. A
fully decoupled SPA, built as static assets, embedded in and served by the
`vaultspec` engine's `serve` mode on localhost. No Tauri fusion in v1.

Reasoning (validation, not just deference):

- **One process, zero config.** `vaultspec-dashboard` launches the engine's
  server and opens a browser tab — the v1 success criterion ("zero
  configuration") with the smallest possible machinery. The rag resident
  service already proves the pattern in this ecosystem.
- **The future extension decides it.** The agent-orchestration end-state
  wants the dashboard to be a client over backend services, explicitly not a
  monolith fused to one rendering (brief, "Future extension"). A Tauri fusion
  is exactly the fusion that constraint warns against.
- **Asymmetric reversibility.** A localhost SPA can be shelled in Tauri later
  with the frontend essentially unchanged — Tauri 2.x (stable since Oct 2024)
  is frontend-agnostic and points at a dev URL or static `distDir` (§11.3);
  the genuinely hard-to-retrofit pieces (tray, deep links, native FS
  permissions) are not in our v1 scope. Unfusing a Tauri-integrated app back
  into a web app is the hard direction. We keep the option, not the cost.
- **What Tauri would buy — and why not yet:** native menus, tray, file-dialog
  polish, single-window feel. None is on the v1 critical path; all are
  additive later. The one real cost of browser-tab delivery — no native
  window identity — is acceptable for a local-first developer tool (the
  Jupyter/retired component gallery precedent).
- Boundary discipline: the GUI speaks **only** the engine's HTTP/SSE API.
  No CLI subprocesses from the frontend, no direct rag calls. One origin, one
  degradation model, one contract (contract §6).

### 5.2 Stack posture (finalized against the stack survey, §11.3)

- **React 19 + TypeScript + Vite (current major)**, pure SPA — no SSR, no
  meta-framework. Named versions throughout this section are research-time
  observations (§11.3, verified 2026-06-12); the binding commitments are
  architectural — scaffolding adopts the then-current stable majors and
  records deviations;
  localhost serving makes server rendering pointless complexity. **TanStack
  Router** for routing (full type-safety on routes/params, native TanStack
  Query loader integration; we have no legacy react-router investment to
  protect).
- **State split, three stores, strictly separated:**
  - *Server state:* TanStack Query v5 — every engine read flows through it
    (caching, invalidation, retry, offline states for free). SSE streams feed
    targeted cache invalidation + small live slices; v5's `streamedQuery`
    consumes the engine's event streams idiomatically (§11.3).
  - *View state:* a lightweight client store (Zustand-class) for selection,
    working set, filters/lens, timeline mode, panel layout. This store is the
    shared brain that keeps browser/stage/timeline/inspector in sync — the
    "selection is one concept" decision lives here.
  - *Scene state:* the graph renderer owns positions, LOD, and per-frame
    animation **outside React**. React never renders the field's nodes; it
    sends commands (set data, set filter, focus node, set time T) and
    subscribes to events (hover, select, open). Per-frame work inside React's
    render cycle is how graph UIs die; this boundary is non-negotiable.
- **Streams:** SSE (not WebSocket) for status/events — unidirectional fits,
  trivially proxied, auto-reconnect. All mutations are plain HTTP verbs.
- **Time-travel state:** the diff log (§4.2) is a client-held data structure
  in the scene layer keyed by the same stable node/edge ids the contract
  guarantees; React Query holds the fetched ranges, the scene replays them.
- **Styling:** Tailwind CSS v4 (CSS-first config; its CSS-variable theming is
  the natural carrier for the design-token layer the visual language needs) +
  unstyled accessible primitives — **Base UI** (the faster-moving,
  MUI-maintained successor line, §11.3), falling back to Radix Primitives
  only if Base UI's maintenance health regresses by implementation — under
  the fully custom skin. No
  CSS-in-JS (runtime CSS-in-JS is in structural decline; styled-components is
  in maintenance mode). No heavy component library — the visual language (§7)
  is bespoke and a themed Material/Mantine would fight it.
- **Serving note for the contract:** SPA fallback routing (deep links resolve
  to `index.html`), correct MIME types from embedded assets, loopback-only
  bind, and `--port` with fail-loud port conflicts are engine-side serving
  requirements recorded in the contract (§11.3 documents the axum +
  rust-embed pattern and its gotchas).

### Proposed decisions — §5

- COMMITTED: decoupled web SPA served by engine `serve`; no Tauri in v1;
  Tauri remains a later additive shell, and nothing may preclude it.
- GUI ↔ engine only (HTTP + SSE); the engine proxies/aggregates the siblings.
- React 19 + TS + Vite SPA; TanStack Query (server) / Zustand-class (view) /
  renderer-owned scene store (per-frame), with React outside the frame loop.
- SSE for all streaming; HTTP for all verbs.

## 6. Rendering engine

Evaluation criteria (fixed first, applied against the renderer survey, §11.2):

- **Scale:** smooth at 1k nodes / 5k edges, usable at 10k/50k, on integrated
  GPUs — WebGL minimum, WebGPU as a progressive path, never a requirement.
- **Custom node rendering:** we must own node visuals completely (sketched
  silhouettes, progress rings, badges — §3.1). A library whose nodes are
  fixed circles-with-labels fails regardless of speed.
- **Hybrid overlay support:** GPU canvas for the field + positioned DOM
  islands for opened nodes (§3.2) — the renderer must expose stable
  screen-space anchoring for overlays.
- **Layout:** pluggable; warm-start/incremental capable (§3.4); GPU-computed
  force layout a strong plus at our scale ceiling.
- **Animation:** first-class attribute transitions (position, opacity, size)
  for filter fades and temporal scrubbing.
- **Health:** TypeScript, active maintenance (verified, not assumed),
  permissive license, React-friendly without owning React.
- **Architecture posture:** the brief mandates *renderer as dependency, node
  abstraction as ours* — prefer a strong rendering/scene-graph substrate over
  an opinionated "graph app framework" we'd fight.

### 6.1 Survey verdict and recommendation

The survey (§11.2) confirms the core tension: no single library delivers both
GPU scale and rich custom nodes cheaply, and the hybrid pattern (GPU field +
DOM islands for opened nodes) is the production-proven resolution — it is the
documented canonical idiom in sigma.js, built into G6's model, and how
second-brain/knowledge-graph tools overwhelmingly ship. The shortlist
resolved to G6 v5 (best single-library adopt), PixiJS v8 + graph toolkit
(best build foundation), and sigma.js v3 + overlay (best fast adopt).

**Recommendation: PixiJS v8 as the rendering substrate**, composed with:

- **graphology** as the graph data model, with its **ForceAtlas2 web-worker
  layout** (§3.4),
- **d3-interpolate/d3-ease** for attribute transitions (filter fades,
  temporal scrub — the literature-grade tweening toolkit, §11.2),
- **React DOM overlay islands** (`@pixi/react` is React-19-native; opened
  nodes are plain React components positioned by the scene's projection),
- hand-drawn glyph family delivered as **sprite/SDF textures** (§7.2),
  rendered as batched Pixi containers in the field.

Why this over the alternatives:

- It is the only option where the node abstraction is **genuinely ours**, as
  the brief mandates. Sigma.js renders custom node anatomy only via per-type
  WebGL shader programs — high friction for sketched silhouettes, progress
  rings, and badges. G6 is an opinionated graph-app framework: its styling
  model and React-node extension would own our node layer, and we would
  trade renderer code for framework-fighting code (plus real doc/community
  friction, §11.2).
- Pixi is muscle, not opinion: WebGL2 + WebGPU progressive, batching,
  culling, hit-testing, pointer events, mature and MIT — exactly "existing
  rendering engine for muscle, our node interface on top."
- Scale headroom (tens of thousands of batched sprites) clears our 10k/50k
  usable bar with margin on integrated GPUs.

Risk and mitigation: this is the build-leaning end of the shortlist — we own
scene management. Mitigate with a **time-boxed spike** (first implementation
week): Pixi field + FA2 worker + DOM islands against a synthetic corpus at
1k/5k and 10k/50k, measuring frame time on integrated graphics. **Named
fallback:** sigma.js v3 + graphology + DOM overlay — same graph model, same
overlay architecture, swap of the field renderer only. The internal renderer
interface (below) is what makes that swap cheap.

Explicitly rejected for the field: react-flow/xyflow (DOM; realistic ceiling
~1–2k nodes — it informs the *opened-node island* interaction grammar
instead); cosmograph/cosmos.gl as primary (superb GPU points-and-links
engine, no rich-node story; reconsider only if we ever need a 100k+ field);
deck.gl graph layers (abandoned-then-experimental lineage); Ogma (commercial
license, and its styling model would own our nodes anyway).

### Proposed decisions — §6

- Criteria fixed as above; WebGL floor, WebGPU progressive.
- Hybrid GPU-field + DOM-island architecture regardless of library pick.
- RECOMMENDED: PixiJS v8 + graphology/FA2-worker + d3 interpolators + React
  DOM islands; glyphs as sprite/SDF textures.
- Our node abstraction wraps the renderer behind an internal scene interface;
  sigma.js v3 is the named, architecture-compatible fallback; week-one spike
  with frame-time gates on integrated GPUs decides finally.

## 7. Visual language charter, expanded

The dashboard defines the vaultspec visual language; the ecosystem inherits
it. Charter → actionable principles:

### 7.1 Conventional skeleton, distinctive skin (the governing split)

- Everything *structural* — layout, panel behavior, shortcuts, scroll/zoom
  physics, focus order — follows the converged agentic-desktop conventions.
  If Claude desktop and Codex desktop both do it, we do it their way.
- Everything *expressive* — iconography, illustration, line quality, texture,
  empty states, motion personality — is ours: hand-drawn, organic, simple
  (MailChimp/Claude lineage).
- Tie-breaker rule: when a choice could be either, it is structural. The skin
  is applied with restraint; a UI that is *all* personality is noise.

### 7.2 Hand-drawn has rules (precision where data lives)

- **Data geometry is precise; decoration is drawn.** Node *positions*, edge
  *endpoints*, timeline *event times*, progress *values* are exact — the
  hand-drawn quality lives in stroke texture, silhouette character, fills,
  and ornament, never in jitter applied to data coordinates. A wobbly line
  may *be* the aesthetic; a wobbly *value* is a lie.
- One drawn line-weight family (2–3 weights), one texture treatment, used
  everywhere — the stage's edges, the timeline's buckets, the rail's icons
  all visibly belong to one hand.
- Glyph set as a designed artifact: doc types, event types, tier marks, state
  marks — a single commissioned hand-drawn glyph family, delivered as SVG +
  GPU-renderable (SDF/sprite) forms. This is real design work, scheduled as
  such (the brief's note), not an implementation by-product.

### 7.3 Color carries meaning, sparingly

- Calm, paper-warm neutral ground (light + dark themes from day one); ink
  for structure. Color is *spent* on: tier identity (four fixed hues/treat-
  ments, §3.3 — the same encoding in the stage, timeline, filter bar, and
  inspector, always), state (active/complete/broken/stale), and liveness.
- Decorative color is rationed to illustrations and empty states. If
  everything is colorful, confidence tiers can't speak.
- Accessibility floor: tier encoding never relies on hue alone (line
  treatment is the primary channel — solid/status/dotted/haze read in
  grayscale); WCAG AA contrast; full keyboard operability of stage and
  timeline (arrow-walk the graph, bracket-step the playhead).

### 7.4 Illustration has jobs

Illustration is functional, not wallpaper. Its assigned jobs:

- **Empty states:** an empty vault, a feature with no audits, a worktree
  without a corpus — each gets a drawing that explains and invites.
- **Degraded states:** rag asleep, service crashed, semantic tier absent —
  honest, charming, unmistakable. (A sleeping machine for a stopped service
  beats a red toast; it communicates *expected* degradation.)
- **Onboarding/first-run:** the three-region tour drawn, not modal-texted.
- **Moments:** feature archived, plan completed — small rewards, used rarely.
- Where there is data, illustration yields. The stage at work is glyphs and
  ink, not scenery.

### 7.5 Motion personality

- Organic easing everywhere (drawn things settle, they don't snap); 150–250ms
  for UI transitions; the stage's physics (force settle, fade-in/out, scrub)
  are the personality's main carrier.
- Motion is informative first: filter fades show what left (§3.5), scrub
  shows growth (§4.2), hover lift shows neighborhood (§3.2). Decorative
  motion is rationed like decorative color. `prefers-reduced-motion` honored
  throughout.

### Proposed decisions — §7

- Governing split codified: structural = conventional, expressive = drawn;
  tie goes to conventional.
- Precision rule: data coordinates exact, hand-drawn quality in rendering
  treatment only.
- One commissioned glyph family (doc/event/tier/state) in SVG + GPU forms;
  budgeted as dedicated design work.
- Fixed product-wide tier color/treatment encoding; line treatment primary,
  hue secondary (grayscale-safe); light + dark from day one; WCAG AA +
  keyboard operability as floor.
- Illustration scoped to empty/degraded/onboarding/moment jobs only.

## 8. Degradation matrix (truthfulness, operationalized)

| Condition                    | Stage                                                 | Timeline                          | Rail                                                | Search                       |
| ---------------------------- | ----------------------------------------------------- | --------------------------------- | --------------------------------------------------- | ---------------------------- |
| rag absent/down              | semantic tier absent; tier dial shows it offline      | unaffected                        | rag card: drawn degraded state + start verb         | text-match fallback + notice |
| core date-mandate not landed | unaffected                                            | lifecycle lane sparse + explainer | in-flight card: designed pre-landing degraded state | unaffected                   |
| structural links broken      | broken edges in warning treatment; "show broken" lens | n/a                               | count surfaced                                      | n/a                          |
| engine stream lost           | stale badge + auto-reconnect; cached view persists    | LIVE chip becomes RECONNECTING    | cards stale-badged                                  | degraded                     |
| no vault in worktree         | invitation empty-state illustration                   | empty                             | git still live                                      | n/a                          |

Every degraded state is designed (7.4), reachable in development via a debug
switch, and tested. Degradation is a feature with a spec, not an error path.

## 9. Out of scope (restated from the brief, GUI-side)

No vault document authoring/editing; no agent orchestration UI (but nothing
here forecloses it — the client-over-services shape is chosen partly for it);
no multi-user/remote/auth; no TUI. Multi-workspace presentation: v1 renders
one worktree scope at a time with a fast switcher; the engine contract keeps
scope a parameter so multi-scope composition stays open.

## 9a. Addendum redlines

Post-ADR amendments to the locked surfaces, recorded here so the seam-lock
discipline (the RL-1..RL-5 SceneController lock, W01.P01.S04) holds: a surface
change is an ADR-flagged redline, never a drive-by edit.

- **RL-1 additive — `SceneNodeData.memberCount?` (2026-06-13,
  `2026-06-13-dashboard-gui` addendum).** When the engine addendum (S02)
  began synthesizing feature-convergence nodes carrying `member_count` (§3.1
  / D4.1: the convergence entity is the primary node, sized by the documents
  converging on it), the scene needed that count to size feature nodes as the
  constellation's centers of gravity. Resolution: add a single OPTIONAL,
  additive, backward-compatible field `memberCount?: number` to the RL-1
  node-data surface. It is absent on document nodes; the sigma.js fallback
  ignores it harmlessly; no command/event/anchor surface changes. This is the
  minimal surface required to render the convergence entity, not a widening of
  the seam. Consumed only by the sprite layer's `nodeRadius`.

## 10. References

- Ideation brief: `2026-06-12-dashboard-foundation-research`
- Engine↔GUI contract: `2026-06-12-dashboard-foundation-reference` —
  AGREED 2026-06-12 (single origin: engine serves SPA + API + ops proxy +
  SSE; keyframe+diff temporal; engine-owned filter vocabulary; stable
  node/edge ids; per-response tier degradation blocks). The contract is
  binding at capability level; endpoint shapes illustrative.
- Research appendix: §11 below.

## 11. Research appendix

Three delegated research sweeps (2026-06-12); load-bearing findings and
citations the spec relies on. Full reports retained in session transcripts.

### 11.1 Graph/network visualization literature (anti-hairball)

Findings this spec is built on:

- **Details-first beats overview-first on dense graphs.** van Ham & Perer,
  "Search, Show Context, Expand on Demand," *TVCG* 15(6), 2009 — DOI-bounded
  contextual subgraphs instead of whole-graph overviews; the basis of §3.2.
  Egocentric extensions: EgoLines (CHI 2016); SpreadLine (arXiv:2408.08992).
- **Edge bundling degrades path-tracing accuracy and time** even as it
  reduces apparent clutter (controlled study, AVI 2012, ACM
  10.1145/2254556.2254670) — basis of §3.3's no-bundling rule; aggregation
  with recoverable structure instead.
- **Motif simplification** (fans/cliques as expandable glyphs) measurably
  improves readability: Dunne & Shneiderman, CHI 2013 — basis of the plan→exec
  fan glyph (§3.3).
- **Uncertainty/confidence channel interference:** Guo, Huang & Laidlaw,
  "Representing Uncertainty in Graph Edges," *TVCG* 21(10), 2015 —
  transparency degrades hue reading; fuzziness degrades width reading;
  lightness/grain are robust. Basis of §3.3's confidence encoding. Edge
  detail on demand: Bludau et al., "Unfolding Edges," *CGF* 2023.
- **Semantic zoom over geometric zoom:** Wiens & Lohmann (K-CAP 2017); ZMLT
  (arXiv:1906.05996) — discrete LoD tiers (constellation → feature → document
  → interior), basis of §3.1's LOD discipline.
- **Compound graphs:** Holten, "Hierarchical Edge Bundles," *TVCG* 2006 —
  containment hierarchy as layout backbone, parent-level edges derived from
  child links (our closed-cluster meta-edges). Dense interiors as
  matrix/icicle hybrids: Rufiange & McGuffin, "TreeMatrix," *CGF* 2012 —
  optional treatment if plan interiors prove dense.
- **Temporal graphs:** Beck, Burch, Diehl & Weiskopf, "A Taxonomy and Survey
  of Dynamic Graph Visualization," *CGF* 2017 (animation vs small-multiples).
  Mental-map stability helps specifically revisitation/path tasks —
  Archambault & Purchase, *IJHCS* 2013; Boyandin et al., *CGF* 2012. Basis of
  §3.4 warm-start layout and §4.2's no-reflow-while-scrubbing rule.
- **Layout:** Jacomy, Venturini, Heymann & Bastian, "ForceAtlas2," *PLOS ONE*
  2014 — designed for 10–10,000-node scale-free networks, continuous,
  Barnes–Hut O(n log n); basis of §3.4.

### 11.2 GPU graph-renderer / node-editor landscape (verified mid-2026)

- **Hybrid GPU-field + DOM-island is the production-proven pattern** —
  documented canonical idiom in sigma.js (layers system), built into G6's
  model (React nodes for focused, light nodes for the field); second-brain
  tools ship this way. Basis of §3.2/§6.
- **PixiJS v8** — WebGL2 + WebGPU 2D scene graph; batching/culling/
  hit-testing; `@pixi/react` v8 (React 19); MIT; very active (v8.16, 2026).
  Best build-foundation; chosen substrate.
- **sigma.js v3 + graphology** — WebGL field engine, MIT, healthy (3.0.3
  Apr 2025; v4 alpha); custom node anatomy requires per-type shader
  programs; documented DOM-overlay layers. Named fallback.
- **G6 (AntV) v5** — Canvas/SVG/WebGL multi-renderer, React-component nodes
  via extension, rich built-in layouts; MIT, active; opinionated framework +
  doc/community friction. Rejected as framework-fighting risk vs the
  our-node-abstraction mandate.
- **react-flow (`@xyflow/react` 12.11, mid-2026)** — DOM/SVG node editor,
  best-in-class React DX; realistic field ceiling ~1–2k nodes (xyflow issue
  #3044). Informs the opened-island grammar only.
- **cosmograph/cosmos.gl** (OpenJS, luma.gl/WebGL2, GPU force layout;
  2.6.x, Nov 2025) — 100k+-scale points-and-links, no rich-node story.
- **deck.gl graph layers** — graph.gl abandoned; community reboot
  experimental. **Ogma** — commercial, closed pricing. Both rejected.
- Layouts: graphology FA2 web-worker variant is the pragmatic choice under
  ~10k nodes; GPU FA2 unnecessary at our scale.

### 11.3 Frontend stack and delivery (verified mid-2026)

- **Localhost-SPA is the dominant CLI-tool delivery pattern** (Jupyter,
  retired component gallery, Open WebUI, pgAdmin). **Tauri 2.0** stable Oct 2024;
  frontend-agnostic (`devPath`/`distDir`), so "shell later" is real and
  low-friction; hard-to-retrofit pieces (tray, deep links) are out of our v1
  scope. Basis of §5.1.
- **React 19.x** (19.2, Oct 2025; compiler opt-in); **Vite 6** unchallenged
  for pure SPAs; **TanStack Router** for type-safe SPA routing with Query
  loader integration.
- **TanStack Query v5** for server state (incl. `streamedQuery` over
  `AsyncIterable` — idiomatic SSE consumption); **Zustand** for client/view
  state. SSE over WebSocket for unidirectional status streams (axum `Sse`
  type; SSE+prefetch measured ~28ms vs ~450ms polling in production
  reports).
- **Tailwind v4** (stable Jan 2025, CSS-first config, token-friendly);
  runtime CSS-in-JS in decline (styled-components maintenance mode, Jan
  2024); primitives: Radix Primitives (slowed post-acquisition) vs Base UI
  (MUI-maintained, faster-moving) — decide at implementation.
- **Serving from Rust:** axum + rust-embed (8.8.x) with SPA fallback to
  `index.html`, correct MIME from embed, loopback-only bind, explicit
  `--port` + fail-loud conflicts; dev-mode filesystem passthrough
  (`#[cfg(debug_assertions)]`). Same-origin serving eliminates CORS. These
  are contract-side requirements (§5.2).

Key links: van Ham & Perer (perer.org/papers/adamPerer-DOIGraphs-InfoVis2009.pdf);
ForceAtlas2 (journals.plos.org/plosone/article?id=10.1371/journal.pone.0098679);
Guo et al. (jeffhuang.com/papers/EdgeUncertainty_TVCG15.pdf); Dunne &
Shneiderman (cs.umd.edu/~ben/papers/Dunne2013Motif.pdf); sigma layers
(sigmajs.org/docs/advanced/layers/); PixiJS (pixijs.com/blog/8.16.0,
pixijs.com/blog/pixi-react-v8-live); xyflow scale (github.com/xyflow/xyflow/
issues/3044); cosmos.gl (openjsf.org/blog/introducing-cosmos-gl); Tauri 2
(v2.tauri.app/blog/tauri-20/); React 19.2 (react.dev/blog/2025/10/01/
react-19-2); Vite 6 (vite.dev/blog/announcing-vite6); streamedQuery
(tanstack.com/query/v5/docs/reference/streamedQuery); Tailwind v4
(tailwindcss.com/blog/tailwindcss-v4); rust-embed axum example
(docs.rs/crate/rust-embed/latest/source/examples/axum.rs).
