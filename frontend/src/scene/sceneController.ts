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
// 2026-06-17: the live graph seam is Cosmos-native. The retired d3 force tuning
// commands have been replaced by one explicit Cosmos config command.

import {
  COSMOS_SIMULATION_DEFAULTS,
  type CosmosSimulationConfig,
} from "./field/cosmosConfig";
import type { RepresentationMode } from "./field/representationLayout";
import type { StatusClass } from "./field/statusStamp";
import type { SemanticLevel } from "./field/camera";

export interface EdgeRenderParams {
  lineWidthScale: number;
}

export const EDGE_RENDER_DEFAULTS: EdgeRenderParams = {
  lineWidthScale: 1,
};

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
  /**
   * Backend-projected world-space node body radius. Additive contract field for
   * the graph renderer; current sprite sizing can continue to derive from
   * salience/memberCount until the render path is switched deliberately.
   */
  nodeSize?: number;
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
  | { kind: "set-data"; nodes: SceneNodeData[]; edges: SceneEdgeData[] }
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
  // Transient cross-highlight (G2.b): lift the named nodes briefly — the
  // timeline's event-click pulse. Additive seam amendment at S36.
  | { kind: "pulse"; ids: ReadonlySet<string> }
  // --- graph-quality addenda (2026-06-13, P01.S02) ----------------------------
  // Camera commands — executed by the field, avoid polling/state leak into app.
  | { kind: "zoom-in" }
  | { kind: "zoom-out" }
  | { kind: "fit-to-view" }
  | { kind: "reset-view" }
  // Cosmos simulation controls: direct @cosmos.gl/graph config names and units.
  | { kind: "set-cosmos-config"; config: Partial<CosmosSimulationConfig> }
  | { kind: "set-simulation-active"; active: boolean }
  | { kind: "set-edge-render-params"; params: Partial<EdgeRenderParams> }
  | { kind: "set-layout-mode"; mode: "force" | "circular" }
  // --- node-graph-rework addendum (ADR D3) -----------------------------------
  // Configurable canvas/sim containment: free (default, unbounded) | circle |
  // rect, with an optional size (radius for circle, half-extent for rect; omitted
  // or 0 = auto-fit non-overlapping). Rect remains a compatibility command value;
  // the default and chrome path are free unless the user explicitly chooses a
  // compact circle. ADR-flagged additive redline per the W01.P01.S04 lock
  // discipline - additive to the locked union, nothing renamed.
  | { kind: "set-bounds"; shape: "free" | "circle" | "rect"; size?: number }
  // --- live Cosmos interaction addenda ---------------------------------------
  // Chrome brackets slider/drag interaction so the field can temporarily switch
  // to the configured interaction decay and alpha.
  | { kind: "begin-interaction" }
  | { kind: "end-interaction" }
  // Freeze toggle: `frozen:true` pauses Cosmos where it is; `frozen:false`
  // resumes without injecting new alpha. The graph lab can tune the lower-level
  // Cosmos config through set-cosmos-config.
  | { kind: "set-frozen"; frozen: boolean }
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
    }
  // Feature kill-switches (graph-perf 2026-06-18): strip the field back to bare
  // nodes + edges + simulation for diagnosis. Each flag, when false, fully disables
  // that interaction layer's GPU/CPU work — hover picking + hover emphasis,
  // selection emphasis, and the feature-tag cluster cohort on hover. Default all on.
  | { kind: "set-feature-flags"; flags: Partial<SceneFeatureFlags> };

/** Toggleable interaction layers over the base nodes+edges+simulation field. */
export interface SceneFeatureFlags {
  /** Pointer hover: bounded picking, the hovered-node emphasis, and hover events. */
  hover: boolean;
  /** Selection emphasis (the shared selected-node greyout + focus ring). */
  selection: boolean;
  /** Expand a hover to the hovered node's feature-tag cohort (cluster highlight).
   *  When false, hover lights only the single node, never its cluster. */
  clusterHighlight: boolean;
}

/** All interaction layers on (the product default). */
export const DEFAULT_SCENE_FEATURE_FLAGS: SceneFeatureFlags = {
  hover: true,
  selection: true,
  clusterHighlight: true,
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
  /** Emitted after set-cosmos-config is applied. */
  | { kind: "cosmos-config-changed"; config: CosmosSimulationConfig }
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

  // --- graph-quality: layout state (P01.S02) -----------------------------------
  private _layoutMode: "force" | "circular" = "force";
  private _cosmosConfig: CosmosSimulationConfig = { ...COSMOS_SIMULATION_DEFAULTS };
  private _edgeRenderParams: EdgeRenderParams = { ...EDGE_RENDER_DEFAULTS };
  // --- node-graph-rework: canvas/sim containment (ADR D3) -----------------------
  private _bounds: { shape: "free" | "circle" | "rect"; size: number } = {
    shape: "free",
    size: 0,
  };
  // --- selection state retained at the seam (W03.P08.S51) -----------------------
  // The inbound `set-selected` selection (graph/Node-items "selected"):
  // dashboard-state owns node selection and pushes it in through the EXISTING
  // command; the controller retains it so a consumer can read the current
  // selection synchronously the same way it reads layout/representation state,
  // never re-deriving it from a held render frame. Purely additive bookkeeping
  // over the locked `set-selected` command - no new command, no new event.
  private _selectedIds: ReadonlySet<string> = new Set();
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
      case "set-cosmos-config":
        this._cosmosConfig = { ...this._cosmosConfig, ...cmd.config };
        this.emit({ kind: "cosmos-config-changed", config: { ...this._cosmosConfig } });
        break;
      case "set-simulation-active":
        break;
      case "set-edge-render-params":
        this._edgeRenderParams = { ...this._edgeRenderParams, ...cmd.params };
        break;
      case "set-layout-mode":
        this._layoutMode = cmd.mode;
        break;
      case "set-bounds":
        this._bounds = { shape: cmd.shape, size: cmd.size ?? 0 };
        break;
      case "set-selected":
        // Retain the inbound selection at the seam (S51): the round-tripped
        // selection (a scene `select` event patched dashboard-state, which pushes
        // the canonical selection back through this command) is held here so a
        // consumer reads it synchronously via getSelectionState(). Still forwarded
        // to the field below (the ring is the renderer's concern).
        this._selectedIds = new Set(cmd.ids);
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

  // --- graph-quality: layout state read (P01.S02) --------------------------------

  /** Synchronous snapshot of the current layout mode. */
  getLayoutState(): { mode: "force" | "circular" } {
    return { mode: this._layoutMode };
  }

  /** Synchronous snapshot of runtime Cosmos simulation parameters. */
  getCosmosConfigState(): CosmosSimulationConfig {
    return { ...this._cosmosConfig };
  }

  /** Synchronous snapshot of renderer edge treatment controls. */
  getEdgeRenderState(): EdgeRenderParams {
    return { ...this._edgeRenderParams };
  }

  /** Synchronous snapshot of the active canvas/sim containment (node-graph-rework
   *  ADR D3). The GraphControls bound control reads its initial truth from here. */
  getBoundsState(): { shape: "free" | "circle" | "rect"; size: number } {
    return { ...this._bounds };
  }

  // --- selection read at the seam (W03.P08.S51) ---------------------------------

  /** Synchronous snapshot of the current selection (the inbound `set-selected`
   *  dashboard-state pushes back through the seam). A defensive copy, so a reader
   *  cannot mutate the controller's held set. Lets a consumer root a re-layout or
   *  a focus on the current selection without re-deriving it from a render frame
   *  - the selection routed through the preserved channel, read here. */
  getSelectionState(): { selectedIds: ReadonlySet<string> } {
    return { selectedIds: new Set(this._selectedIds) };
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
