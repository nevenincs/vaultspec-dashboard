// Scene state lives OUTSIDE React (gui-spec §5.2, non-negotiable boundary):
// the renderer owns positions, LOD, and per-frame animation. React never
// renders the field's nodes; it sends commands and subscribes to events.
// This module is framework-free by design — no React imports, ever.
//
// Interface shape reviewed by experience-architect (2026-06-12 redline).
// LOCKED (W01.P01.S04, 2026-06-12): the RL-1 to RL-5 fold is final. The
// command, event, and anchor surface below is the seam every consumer
// builds against; the PixiJS v8 field (G6.b verdict: confirmed, S03) plugs
// in behind it, and the sigma.js v3 fallback must keep implementing the
// same surface. Surface changes from here on are ADR-flagged redlines, not
// drive-by edits.
//
// 2026-06-19: the live graph seam is the three.js + d3-force field. The Cosmos
// config command has been removed; force tuning is the field's own concern.

import type { RepresentationMode } from "./field/representationLayout";
import type { StatusClass } from "./field/statusStamp";
import type { SemanticLevel } from "./field/cameraCore";

/**
 * The force knobs the graph-controls UI tunes on the active field (replaces the
 * retired Cosmos config command). Three-native d3-force params: `charge` is the
 * many-body repulsion (negative = repel), `linkDistance` the spring rest length,
 * `linkStrength` the global link-spring multiplier. All optional — a slider sends
 * only what it changed and the field merges them via its own setForceParams.
 */
export interface GraphForceParams {
  charge?: number;
  linkDistance?: number;
  linkStrength?: number;
}

/**
 * The appearance / "look" knobs the graph-controls UI tunes on the active field
 * (graph-backend-unification ADR D3): node-size scale, salience spread, edge
 * width/opacity range, and edge colour-inheritance mode. Mirrors the field's
 * AppearanceParams structurally; all optional — the field merges them via its own
 * setAppearanceParams. Defined locally (not imported from scene/three) to keep the
 * seam free of a renderer-type import cycle, exactly like GraphForceParams.
 */
export interface GraphAppearanceParams {
  nodeSizeScale?: number;
  nodeSalienceScale?: number;
  edgeWidthMin?: number;
  edgeWidthMax?: number;
  edgeOpacityMin?: number;
  edgeOpacityMax?: number;
  edgeColorMode?: "solid" | "gradient";
  /** Draw nodes as their doc-type element mark instead of a plain category circle
   *  (graph-node-icons). The field cross-fades circles to icons by on-screen size. */
  nodeIcons?: boolean;
}

export type GraphBoundsShape = "free" | "circle" | "rect";

/**
 * Graph data for one node — visual-anatomy inputs only (RL-1).
 *
 * Positions are scene-internal: the FA2 worker computes them inside the
 * scene layer and the warm-start cache restores them. React can never set
 * a position; `seedPosition` is at most an optional warm-start hint.
 */
export interface SceneNodeData {
  id: string;
  /** Node species/doc type — drives the silhouette glyph (gui-spec §3.1). */
  kind: string;
  /**
   * Vault document type (`adr`/`plan`/`exec`/`audit`/`index`/`research`/…) when
   * the node is a document. The wire `kind` is the generic node SPECIES
   * (`document`/`plan-container`/`code-artifact`/`feature`), NOT the category —
   * so the node-fill category colour is resolved from `docType` first, falling
   * back to `kind` for species that carry no doc type (feature/plan-container/
   * code-artifact). Absent on non-document nodes.
   */
  docType?: string;
  /** Display title — drives the DOI-culled label (contract §4 node field). */
  title?: string;
  /**
   * Feature-membership tags (contract §4 node field). Drives the feature overlays
   * (graph-representation ADR): GMap country labels and BubbleSets hulls group
   * nodes by feature. Additive optional seam field; absent on nodes outside any
   * feature (a bare code/commit artifact).
   */
  featureTags?: string[];
  /** Lifecycle state + progress — drives ring/fill treatment. */
  lifecycle?: { state: string; progress?: { done: number; total: number } };
  /** Per-tier degree counts — drives tier badges (contract §4). */
  degreeByTier?: Partial<
    Record<"declared" | "structural" | "temporal" | "semantic", number>
  >;
  /** Created/modified timestamps — drives the freshness halo. */
  dates?: { created?: string; modified?: string };
  /**
   * Feature-convergence nodes only: documents converging on the feature
   * (contract §4 `member_count`, engine addendum S02). Drives the
   * center-of-gravity radius (ADR D4.1) — the visual semantic that makes
   * feature nodes the constellation's anchors.
   *
   * SEAM REDLINE (2026-06-13, dashboard-gui addendum): additive, optional,
   * backward-compatible field on the locked RL-1 node-data surface. Flagged in
   * the GUI ADR (2026-06-12-dashboard-gui-adr §9a, "RL-1 additive") per the
   * W01.P01.S04 lock discipline; it is the minimal surface needed to render the
   * convergence entity, not a drive-by edit. The sigma.js fallback ignores it
   * harmlessly.
   */
  memberCount?: number;
  /**
   * Per-lens importance scalar in [0,1] (graph-node-salience ADR, consumed via
   * graph-representation). Drives node SIZE (superseding the member-count radius
   * for non-feature species) and LABEL PRIORITY in the DOI cull. Absent when the
   * origin does not serve it; the sprite layer falls back to the base radius.
   *
   * SEAM REDLINE (graph-representation W01.P01): additive, optional,
   * backward-compatible on the locked RL-1 node-data surface — flagged per the
   * W01.P01.S04 lock discipline. The sigma.js fallback ignores it harmlessly.
   */
  salience?: number;
  temporal?: { bucket: string };
  /**
   * Per-node semantic embedding vector (graph-representation ADR §4 amendment):
   * the rag embedding the CPU worker projects with UMAP for the semantic layout
   * mode. The renderer never receives layout coordinates from the engine; it
   * receives this raw vector and the worker projects it. Absent on nodes lacking
   * an embedding (drawn in a connectivity-fallback position).
   */
  embedding?: number[];
  /**
   * The node's resolved per-type lifecycle status (node-visual-richness ADR
   * P01/P03): the raw `value` token, its resolved treatment `class`, and an
   * `ordinal` magnitude (tiered 1..4 / graded 1..4) when the class carries one.
   * Drives the status STAMP — the single grayscale-safe status treatment per
   * node at field LOD (`statusStamp.ts` `stampFor`). Absent on nodes with no
   * per-type status (a bare code/commit artifact, or a type with no status
   * machine); the sprite layer renders no stamp then.
   *
   * SEAM REDLINE (node-visual-richness P03.S08): additive, optional,
   * backward-compatible on the locked RL-1 node-data surface — flagged per the
   * W01.P01.S04 lock discipline, mirroring the `salience`/`memberCount`
   * redlines. The sigma.js fallback ignores it harmlessly.
   */
  status?: { value?: string; class?: StatusClass; ordinal?: number };
  /**
   * The authority register the node answers in (graph-node-semantics ADR):
   * `design`/`roadmap`/`evidence`/`judgment`/`manifest`. The lineage layout
   * (W03 D5) suppresses `manifest` (generated index) nodes from the derivation
   * spine — they are manifests, not lineage members. Additive/optional.
   */
  authorityClass?: string;
  /** Optional warm-start seed only; the renderer owns positions (RL-1). */
  seedPosition?: { x: number; y: number };
}

/**
 * Graph data for one edge — mirrors the contract §4 edge shape (RL-2).
 * The tier encoding is the product's headline; the scene interface must be
 * able to express it from day one.
 */
export interface SceneEdgeData {
  id: string;
  src: string;
  dst: string;
  relation: string;
  tier: "declared" | "structural" | "temporal" | "semantic";
  confidence: number;
  /** Structural tier only. */
  state?: "resolved" | "stale" | "broken";
  /**
   * Engine-aggregated constellation meta-edges only (contract §4): the
   * ribbon's thickness is the count, the breakdown unfolds on hover.
   */
  meta?: { count: number; breakdownByTier: Record<string, number> };
  /**
   * Pipeline-derivation relation label (graph-node-semantics ADR), carried
   * ALONGSIDE the inference `tier`. Drives the lineage layout's derivation axis
   * (research -> adr -> plan -> exec -> audit -> rule) and the lineage edge
   * treatment. Absent on edges without a framework-derivation meaning (e.g. a
   * raw semantic similarity). Not part of the edge identity.
   */
  derivation?: string;
}

/**
 * RL-3 placeholder: one delta shape shared by the live `graph` SSE channel
 * and `/graph/diff` (contract §5). `set-data` is the keyframe;
 * `apply-deltas` is everything else — scrubbing replays the held delta log.
 */
export interface SceneDelta {
  op: "add" | "remove" | "change";
  node?: SceneNodeData;
  edge?: SceneEdgeData;
  t: number;
  seq: number;
}

export type SceneCommand =
  // `reflow` is an ADDITIVE optional flag (default undefined ≡ false preserves the
  // existing behaviour): a `reflow:true` set-data is a FILTER-driven topology change
  // (nodes/edges removed or re-added by the active filter), so the field forces a
  // warm-start — carried nodes resume their positions and the layout re-forms around
  // the survivors — and never refits the camera, instead of the cold re-explode a
  // large drop would otherwise take. Powers the reflow filter mode (graph-controls
  // toggle); omit it and set-data behaves exactly as before.
  | {
      kind: "set-data";
      nodes: SceneNodeData[];
      edges: SceneEdgeData[];
      reflow?: boolean;
    }
  | { kind: "apply-deltas"; deltas: SceneDelta[]; seq: number }
  // `animate` is an ADDITIVE optional flag on the locked seam (default undefined ≡
  // true preserves the existing animated-follow behaviour): `animate:false`
  // re-centers INSTANTLY, for keyboard-initiated focus which must never animate
  // (base motion law). The camera ALSO snaps instantly under
  // prefers-reduced-motion regardless of this flag. No new command and no new
  // semantics — existing consumers that omit `animate` are unaffected.
  | { kind: "focus-node"; id: string; animate?: boolean }
  // RL-5a: filter SEMANTICS live engine/view-side; the scene receives only
  // the computed visibility membership and animates the diff (§3.5 fade).
  | {
      kind: "set-visibility";
      visibleNodeIds: ReadonlySet<string>;
      visibleEdgeIds: ReadonlySet<string>;
    }
  | { kind: "set-time"; at: number | "live" }
  // Pins are layout-fixed and always-labelled (G5.d); the view store owns
  // pin persistence and tells the scene which nodes are fixed.
  | { kind: "set-pinned"; ids: ReadonlySet<string> }
  // Selected node ids drive the canvas SELECTED state — the concentric accent
  // ring around the node body (graph/Node-items 83:2 "selected"). The view store
  // owns the one shared selection; this tells the scene which body draws the
  // ring. The scene already EMITS `select` events; this is the inbound half so
  // a cross-region selection (browser row, palette, keyboard walk) also rings
  // the node on the canvas. ADDITIVE to the locked union (dashboard-node-redesign;
  // mirrors the set-pinned additive shape) — no existing member renamed/removed.
  | { kind: "set-selected"; ids: ReadonlySet<string> }
  // Visual-only META-HIGHLIGHT (#16): soft, hover-style emphasis of a SET of nodes (a
  // rail-selected feature's members) — they keep full colour while non-members recede,
  // exactly like a hover cohort, but with NO selection ring. DISTINCT from `set-selected`
  // (which rings, and the scene enforces SINGLETON): a feature select emits `frame-nodes`
  // (camera) + this, NEVER a multi-id `set-selected`. An empty set clears the highlight.
  // Additive to the locked union — no existing member renamed/removed.
  | { kind: "set-meta-highlight"; ids: ReadonlySet<string> }
  // Transient cross-highlight (G2.b): lift the named nodes briefly — the
  // timeline's event-click pulse. Additive seam amendment at S36.
  | { kind: "pulse"; ids: ReadonlySet<string> }
  // --- graph-quality addenda (2026-06-13, P01.S02) ----------------------------
  // Camera commands — executed by the field, avoid polling/state leak into app.
  | { kind: "zoom-in" }
  | { kind: "zoom-out" }
  | { kind: "fit-to-view" }
  // One-shot frame to a SUBSET of nodes (follow-mode-selection-sync): fit the
  // camera to the bounding box of the given node ids — the rail FEATURE-select
  // frame for that feature's members (distinct from `fit-to-view`, which frames the
  // WHOLE graph). The renderer owns the fit math (`fitToNodes(ids)`); empty/unknown
  // ids are a no-op. Being a deliberate user-initiated camera move, it MUST yield
  // the continuous `set-autoframe` easing (so the subset frame is not immediately
  // re-fit to the whole graph) until the next explicit fit/enable — same
  // manual-camera intent a user drag asserts. ADDITIVE to the locked union; no
  // existing member renamed or removed.
  | { kind: "frame-nodes"; ids: ReadonlySet<string> }
  | { kind: "reset-view" }
  | { kind: "set-simulation-active"; active: boolean }
  // Three-native force tuning (replaces the retired set-cosmos-config): the
  // graph-controls sliders patch the field's d3-force params live.
  | { kind: "set-force-params"; params: GraphForceParams }
  // Three-native appearance tuning (graph-backend-unification ADR D3): the
  // graph-controls appearance sliders patch the field's node-size + edge look.
  | { kind: "set-appearance-params"; params: GraphAppearanceParams }
  // --- live interaction addenda ----------------------------------------------
  // Chrome brackets a slider/drag interaction so the field can bracket an
  // interaction decay/alpha (a light no-op on the three.js field today).
  | { kind: "begin-interaction" }
  | { kind: "end-interaction" }
  // Freeze toggle: `frozen:true` pauses the field's simulation where it is;
  // `frozen:false` resumes without injecting new alpha.
  | { kind: "set-frozen"; frozen: boolean }
  // Autoframe toggle (graph-autoframe): `enabled:true` (the default) makes the field
  // continuously ease the camera to keep the whole graph framed as it changes (interval-
  // polled + hysteresis-gated + skipped while the user is interacting); `enabled:false`
  // holds the camera for full manual control.
  | { kind: "set-autoframe"; enabled: boolean }
  | { kind: "set-bounds"; shape: GraphBoundsShape; size?: number }
  // --- graph-representation addenda (W03.P08) -------------------------------
  // Representation-mode switch (graph-representation ADR): connectivity (FA2,
  // default) | lineage (derivation-DAG axis) | semantic (UMAP over embeddings).
  // EXPLICITLY DISTINCT from `set-layout-mode` (force|circular): representation
  // mode changes WHICH CPU-worker layout runs and what data it consumes;
  // force/circular only tunes the force solver. The scene re-runs the mode's
  // worker layout with id-keyed object constancy (the position cache seeds the
  // transition) and echoes `representation-mode-changed`. Additive to the locked
  // union; no existing member is renamed or removed.
  | { kind: "set-representation-mode"; mode: RepresentationMode }
  // Overlay visibility (graph-representation ADR): feature-country labels at
  // overview, BubbleSets hulls at document LOD. View state owned by the
  // view-store; the scene toggles the hull/label layer WITHOUT re-layout (set
  // overlays are projections that do not move nodes).
  | {
      kind: "set-overlays";
      featureCountries: boolean;
      featureHulls: boolean;
    };

// RL-5c folded at lock time (W01.P01.S04): `expand` (keyboard E / context
// menu, distinct from open) and `pin` are part of the locked union — a
// locked seam cannot carry an "open by design" event set.
export type SceneEvent =
  | { kind: "hover"; id: string | null }
  | { kind: "select"; id: string | null }
  | { kind: "open"; id: string }
  | { kind: "expand"; id: string }
  | { kind: "pin"; id: string; pinned: boolean }
  // --- graph-quality addenda (2026-06-13, P01.S04 / P02.S06) -----------------
  /** Emitted on every camera.onChange — toolbar zoom display + LOD level. */
  | { kind: "camera-change"; scale: number; level: SemanticLevel }
  // --- context menu (2026-06-15, dashboard-context-menus W04.P10) -------------
  /**
   * Emitted on right-click over the field: `id` is the node under the pointer or
   * null for empty canvas; `clientX`/`clientY` are viewport coords for the menu
   * anchor. ADR-flagged additive redline (dashboard-context-menus ADR, layer 6)
   * per the W01.P01.S04 lock discipline - additive to the locked union, no
   * existing member changed. The scene only REPORTS the gesture; app-chrome owns
   * the menu and all intent.
   */
  | {
      kind: "context-menu";
      id: string | null;
      target: "node" | "edge";
      clientX: number;
      clientY: number;
    }
  // --- render capability (scene-WebGL hardening) ----------------------------
  /**
   * The scene's GPU render capability, emitted on init, WebGL context loss, and
   * restore. The stores layer surfaces it like a degradation tier and app-chrome
   * renders the designed CanvasState (gpu-unavailable / context-lost) — the scene
   * only DETECTS + REPORTS + owns the GL rebuild, never its own DOM fallback.
   */
  | {
      kind: "render-capability";
      state: "ok" | "context-lost" | "unavailable";
      recoverable: boolean;
      reason?: string;
    }
  // --- graph payload truncation (memory hardening) ---------------------------
  /**
   * Emitted when the scene defensively clamps an oversized set-data payload at its OWN
   * wire-ingestion boundary (Rule 2 — bound + report, never trust the upstream cap). The
   * stores adapter already caps below this so it normally never fires; the stores layer can
   * surface honest truncation ("showing N of M") if it ever does.
   */
  | { kind: "graph-truncated"; shown: number; total: number }
  // --- graph-representation addenda (W03.P08) -------------------------------
  /**
   * Emitted after a set-representation-mode is applied. Carries the mode the
   * scene ACTUALLY ran — which may DOWNGRADE from the requested mode when a gated
   * mode (semantic) is held by its promotion gate, so the chrome reflects the
   * honest applied mode, never the requested-but-held one.
   */
  | {
      kind: "representation-mode-changed";
      requested: RepresentationMode;
      applied: RepresentationMode;
      downgradeReason?: string;
    };

type SceneEventListener = (event: SceneEvent) => void;

/** Screen-space anchor for a DOM island (RL-4). */
export interface SceneAnchor {
  x: number;
  y: number;
  scale: number;
}

type SceneAnchorListener = (anchor: SceneAnchor | null) => void;

/**
 * The renderer side of the seam. The PixiJS v8 field implements it (G6.b,
 * confirmed); the named sigma.js fallback would implement the same
 * interface. Injected into the SceneController, which delegates lifecycle —
 * the seam's public surface is unchanged by the injection.
 */
export interface SceneFieldRenderer {
  mount(host: HTMLElement): void;
  resize(width: number, height: number): void;
  destroy(): void;
  /** Optional one-shot anchor refresh when a consumer starts tracking a node. */
  refreshAnchors?(): void;
  /** Forwarded scene commands (renderer concerns: data, visibility, time). */
  command?(cmd: SceneCommand): void;
}

/**
 * The renderer-owned scene store, kept renderer-agnostic: the PixiJS v8
 * field (gui-spec §6.1; spike gate closed and verdict confirmed,
 * W01.P01.S03) plugs in behind this surface, and the sigma.js fallback
 * (layers system) must be able to implement the same surface — this
 * interface is what makes the swap cheap.
 */
export class SceneController {
  private listeners = new Set<SceneEventListener>();
  private trackedNodes = new Map<string, Set<SceneAnchorListener>>();
  private nodes: SceneNodeData[] = [];
  private edges: SceneEdgeData[] = [];
  private field: SceneFieldRenderer | null;

  // --- graph-representation: representation-mode + overlay state (W03.P08) ------
  private _representationMode: RepresentationMode = "connectivity";
  private _overlays: { featureCountries: boolean; featureHulls: boolean } = {
    featureCountries: true,
    featureHulls: true,
  };

  constructor(field: SceneFieldRenderer | null = null) {
    this.field = field;
  }

  // --- lifecycle (RL-5b) — delegated to the field renderer ------------------

  /** Attach the renderer's canvas into the host element. */
  mount(host: HTMLElement): void {
    this.field?.mount(host);
  }

  /** Propagate host resize to the renderer viewport. */
  resize(width: number, height: number): void {
    this.field?.resize(width, height);
  }

  /** Tear down renderer, workers, and subscriptions. */
  destroy(): void {
    this.field?.destroy();
    this.listeners.clear();
    this.trackedNodes.clear();
  }

  // --- commands in ----------------------------------------------------------

  /** React (or the spike harness) sends commands; never per-frame state. */
  command(cmd: SceneCommand): void {
    switch (cmd.kind) {
      case "set-data":
        this.nodes = cmd.nodes;
        this.edges = cmd.edges;
        break;
      case "set-simulation-active":
        break;
      case "set-representation-mode":
        this._representationMode = cmd.mode;
        break;
      case "set-overlays":
        this._overlays = {
          featureCountries: cmd.featureCountries,
          featureHulls: cmd.featureHulls,
        };
        break;
      case "apply-deltas":
        // Delta log (RL-3) applied by the field renderer.
        break;
      case "set-selected":
      case "focus-node":
      case "set-visibility":
      case "set-time":
      case "set-pinned":
      case "pulse":
      case "zoom-in":
      case "zoom-out":
      case "fit-to-view":
      case "reset-view":
      case "begin-interaction":
      case "end-interaction":
      case "set-frozen":
      case "set-bounds":
      case "set-force-params":
      case "set-appearance-params":
        // Renderer concerns — forwarded below.
        break;
    }
    this.field?.command?.(cmd);
  }

  // --- events out ------------------------------------------------------------

  /** Subscribe to interaction events (hover, select, open). */
  on(listener: SceneEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * RL-4: anchor subscription for DOM islands — fires on camera or position
   * change with the node's screen-space anchor ({x, y, scale}) or null when
   * the node leaves the stage. Subscription form keeps per-frame polling
   * out of React.
   */
  trackNode(id: string, listener: SceneAnchorListener): () => void {
    let set = this.trackedNodes.get(id);
    if (!set) {
      set = new Set();
      this.trackedNodes.set(id, set);
    }
    set.add(listener);
    this.field?.refreshAnchors?.();
    return () => {
      set.delete(listener);
      if (set.size === 0) this.trackedNodes.delete(id);
    };
  }

  /** Renderer-side dispatch — exposed for the spike and for tests. */
  emit(event: SceneEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /** Renderer-side registry read (RL-4) — the anchor driver's input. */
  trackedNodeIds(): IterableIterator<string> {
    return this.trackedNodes.keys();
  }

  /** Renderer-side anchor dispatch (RL-4) — exposed for tests. */
  emitAnchor(id: string, anchor: SceneAnchor | null): void {
    const set = this.trackedNodes.get(id);
    if (!set) return;
    for (const listener of set) {
      listener(anchor);
    }
  }

  get nodeCount(): number {
    return this.nodes.length;
  }

  get edgeCount(): number {
    return this.edges.length;
  }

  // --- graph-quality: minimap registration (P02.S06) ----------------------------

  /**
   * Chrome mounts a <canvas> and calls this to register it; the scene renders
   * a downscaled overview into it on every position frame. Call with null on
   * unmount to stop rendering.
   */
  setMinimapCanvas(canvas: HTMLCanvasElement | null): void {
    if (this.field && "setMinimapCanvas" in this.field) {
      (
        this.field as { setMinimapCanvas(c: HTMLCanvasElement | null): void }
      ).setMinimapCanvas(canvas);
    }
  }

  // --- graph-representation: representation-mode + overlay reads (W03.P08) ------

  /** Synchronous snapshot of the active representation mode (connectivity by
   *  default) and overlay visibility — the AlgorithmPanel/RepresentationModePanel
   *  read their initial truth from here, never from the wire. */
  getRepresentationState(): {
    mode: RepresentationMode;
    overlays: { featureCountries: boolean; featureHulls: boolean };
  } {
    return { mode: this._representationMode, overlays: { ...this._overlays } };
  }
}
