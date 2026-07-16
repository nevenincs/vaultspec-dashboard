import { DataTexture, FloatType, NearestFilter, RGBAFormat } from "three";
import {
  foldSceneDeltas,
  type SceneCommand,
  type SceneDelta,
  type SceneEdgeData,
  type SceneNodeData,
} from "../../sceneController";
import {
  accentColor,
  canvasBackground,
  highlightColor,
  inkColor,
  inkMutedColor,
  nodeWorldRadius,
  sceneRuleColor,
} from "../appearance";
import { D3ForceSolver } from "../d3ForceSolver";
import { type NodePosition } from "../../positionCache";
import { classifySwap } from "../swapClassifier";
import { labelTextStyle } from "../labelStyle";
import { rootFontPx } from "../uiScale";
import {
  COLD_START_ALPHA,
  MAX_SCENE_NODES,
  PREWARM_BUDGET_MS,
  PREWARM_MAX_TICKS,
  WARM_START_ALPHA,
  ZOOM_STEP_BUTTON,
} from "./config";
import { hexCss } from "./geometry";
import { ThreeFieldGpuResources } from "./gpuResources";
import type { OverlayThemeDerived } from "./state";

export abstract class ThreeFieldData extends ThreeFieldGpuResources {
  command(cmd: SceneCommand): void {
    switch (cmd.kind) {
      case "set-data":
        this.setData(
          cmd.nodes,
          cmd.edges,
          cmd.reflow ?? false,
          false,
          cmd.reset ?? false,
        );
        break;
      case "set-selected": {
        // SINGLETON enforcement (#16): the graph rings AT MOST ONE node — a >1-id
        // set-selected (the old feature-members multiselect the user rejected) collapses
        // to a single id. A node click already selects exactly one; feature emphasis goes
        // through `set-feature-spotlight`, never a multi-id selection.
        const first = cmd.ids.values().next().value;
        this.selectedIds = first === undefined ? new Set() : new Set([first]);
        this.applyEmphasis();
        this.requestRender();
        break;
      }
      case "set-feature-spotlight": {
        // DURABLE feature-cluster spotlight (feature-selection-global-state): store the
        // selected feature TAG and emphasise its cohort (non-members recede), persisting
        // across data reloads because `emphasisSet` re-derives membership from the live
        // `featureCohort`. A genuine change with `frame` requested fires a ONE-SHOT camera
        // frame to the cohort (the follow-gated rail-select frame); the durable re-apply on
        // `setData` never re-frames, so a refresh keeps the spotlight without yanking.
        const changed = cmd.tag !== this.spotlightFeatureTag;
        this.spotlightFeatureTag = cmd.tag;
        this.applyEmphasis();
        if (cmd.tag !== null && changed && cmd.frame) {
          const members = this.featureCohort.get(cmd.tag);
          if (members && members.size > 0) {
            this.autoframeTarget = null;
            this.autoframeSuspended = true;
            this.fitToNodes(members);
          }
        }
        this.requestRender();
        break;
      }
      case "set-pinned":
        this.pinnedIds = new Set(cmd.ids);
        this.requestRender();
        break;
      case "set-visibility":
        this.visibleNodeIds = new Set(cmd.visibleNodeIds);
        this.applyVisibility(cmd.visibleNodeIds, cmd.visibleEdgeIds);
        // A filter visibility change is a STATE change: when autoframe is on, re-frame to the
        // now-visible subset (graphBounds is visibility-aware), even if a prior manual nav had
        // disengaged it.
        this.reengageAutoframe();
        this.requestRender();
        break;
      case "focus-node":
        this.focusNode(cmd.id);
        break;
      case "set-simulation-active":
        // Resume/pause is energy-neutral: just toggle ticking, never re-pump heat.
        // (A fresh layout reheats via set-data; an explicit restart via reheatNow.)
        if (cmd.active) this.resume();
        else this.setRunning(false);
        break;
      case "sim-play":
        // Deliberate PLAY intent (the top-left play/pause control): a paused mid-flight
        // settle RESUMES energy-neutrally; an already-settled layout gets the explicit
        // named restart (reheatNow) — the sim then runs its cooling schedule and the
        // settle transition auto-emits sim-state{running:false}, flipping the button
        // back without any wall-clock timer. A frozen field ignores play (the chrome
        // unfreezes first through the set-frozen seam).
        if (this.frozen) break;
        if (this.solver && !this.solver.isSettled()) this.resume();
        else this.reheatNow();
        break;
      case "set-autoframe":
        this.setAutoframe(cmd.enabled);
        break;
      case "set-frozen":
        // Freeze is a PAUSE, not a re-energise: freezing stops ticking in place, and
        // unfreezing RESUMES an in-flight settle WITHOUT pumping new heat. A graph
        // already at rest stays exactly put on unfreeze — a freeze toggle must never
        // modify simulation state (issue #5). The old `resume()` here reheated to
        // WARM_ALPHA + woke every node, re-exploding a settled layout on every toggle.
        this.frozen = cmd.frozen;
        if (cmd.frozen) {
          this.setRunning(false);
        } else if (this.solver && !this.solver.isSettled()) {
          this.setRunning(true);
          this.wake();
        }
        break;
      case "fit-to-view":
      case "reset-view":
        // An explicit "fit all" is a whole-graph frame → clear any selection-frame
        // suspension so autoframe resumes tracking the whole graph from here (#13).
        this.autoframeSuspended = false;
        this.fitToView();
        break;
      case "frame-nodes":
        // One-shot user selection-frame (follow-mode #13): fit the subset and SUSPEND
        // whole-graph autoframe so it never re-fits over the user's focused frame, until
        // the next data change / explicit fit / autoframe re-enable. A deliberate camera
        // move, so it also cancels any in-flight autoframe ease.
        this.autoframeTarget = null;
        this.autoframeSuspended = true;
        this.fitToNodes(cmd.ids);
        break;
      case "zoom-in":
        this.zoomBy(ZOOM_STEP_BUTTON);
        break;
      case "zoom-out":
        this.zoomBy(1 / ZOOM_STEP_BUTTON);
        break;
      case "apply-deltas":
        this.applyDeltas(cmd.deltas);
        break;
      case "pulse":
        this.pulseNodes(cmd.ids);
        break;
      case "set-representation-mode":
        // No-op: the representation-mode switch was retired (only connectivity
        // ships). Acknowledged so it is never silently dropped.
        break;
      case "set-time":
        // No-op: time travel is driven by the stores replaying the slice through
        // set-data; the field owns no time state (mirrors CosmosField).
        break;
      case "set-overlays":
        // No-op: feature-country labels + BubbleSets hulls render in a separate
        // overlay layer, not the field (mirrors CosmosField).
        break;
      case "set-bounds":
        // No-op in the current field: graph bounds are preserved as a scene seam
        // command so the dashboard state can project containment intent centrally.
        break;
      case "begin-interaction":
      case "end-interaction":
        // Light no-op: reheat-on-change already keeps the sim warm during edits;
        // no interaction-specific decay bracket is needed.
        break;
      case "set-force-params":
        // Live force tuning from the graph-controls sliders.
        this.setForceParams(cmd.params);
        break;
      case "set-appearance-params":
        // Live look tuning (node size/salience, edge width/opacity, colour mode)
        // from the graph-controls sliders.
        this.setAppearanceParams(cmd.params);
        break;
      case "refresh-theme":
        this.refreshTheme();
        break;
      default:
        break;
    }
  }

  /** Re-read every theme-dependent colour after a `[data-theme]` flip and repaint.
   *
   *  The GL field bakes its colours — node/edge category hues, the canvas-background
   *  recede target, the ink-muted edge dim, and the per-disc glyph inks — into instanced
   *  buffer attributes and shader uniforms at build time (the literal-hex scene-token
   *  contract is a getComputedStyle read, not a live `var()` binding), so a theme change
   *  does NOT reach them; only the per-frame label + minimap reads re-theme on their own.
   *  Rebuilding the GL resources from the cached marks re-runs `buildNodes`/`buildEdges`/
   *  `buildGlyphs`, which re-read all tokens fresh, while the d3-force layout
   *  (`cpuPositions`) and selection/edge emphasis are preserved (no re-layout, no camera
   *  move). We then re-apply the renderer clear colour and request one frame. Theme flips
   *  are rare and user/OS-initiated, so a one-shot GL rebuild is the robust choice over
   *  threading a colour-only update through every bake site. */
  protected refreshTheme(): void {
    // SGR-006: a theme change invalidates the cached overlay CSS/style derivations.
    this.themeEpoch += 1;
    this.rebuildGLResources();
    this.applyBackground();
    this.requestRender();
  }

  /** The 2D-overlay token→CSS derivations (ring/label/pill colours + per-role label
   *  text styles), memoized per theme epoch and root font size (SGR-006). Recomputed
   *  only when the theme flips (`refresh-theme`) or the UI scale changes; otherwise
   *  the same object is reused across frames, avoiding per-frame getComputedStyle
   *  reads, hex→string work, and label-style allocation. */
  protected overlayTheme(): OverlayThemeDerived {
    const epoch = this.themeEpoch;
    const fontPx = rootFontPx();
    const cached = this.overlayThemeCache;
    if (cached && cached.epoch === epoch && cached.fontPx === fontPx) return cached;
    const derived = {
      epoch,
      fontPx,
      ink: hexCss(inkColor()),
      accent: hexCss(accentColor()),
      highlight: hexCss(highlightColor()),
      inkMuted: hexCss(inkMutedColor()),
      pillFill: hexCss(canvasBackground()),
      pillBorder: hexCss(sceneRuleColor()),
      featureStyle: labelTextStyle("feature"),
      docStyle: labelTextStyle("document"),
    };
    this.overlayThemeCache = derived;
    return derived;
  }

  // --- data ----------------------------------------------------------------

  protected setData(
    nodes: SceneNodeData[],
    edges: SceneEdgeData[],
    reflow = false,
    deltaDriven = false,
    reset = false,
  ): void {
    if (!this.renderer) return;

    // Defense-in-depth: bound the node payload at the scene's OWN wire-ingestion boundary
    // (Rule 2). The stores adapter already clamps to MAX_CLIENT_GRAPH_NODES, but the scene
    // independently caps so a direct/regressed/oversized set-data can't exhaust GPU memory;
    // it reports honest truncation. Edges among dropped nodes are skipped automatically (the
    // index below only holds the kept nodes).
    if (nodes.length > MAX_SCENE_NODES) {
      this.controller?.emit({
        kind: "graph-truncated",
        shown: MAX_SCENE_NODES,
        total: nodes.length,
      });
      nodes = nodes.slice(0, MAX_SCENE_NODES);
    }

    // Warm-start (object constancy): capture the PRIOR layout by id BEFORE teardown,
    // so nodes that persist across this set-data resume from where they were instead
    // of re-exploding. The app re-sends set-data on every working-set expansion and
    // live update; without this the graph re-explodes each time.
    const prevPos = new Map<string, { x: number; y: number }>();
    for (const [id, idx] of this.idToIndex) {
      // Carry PHYSICS truth, never the eased display (a mid-glide swap must seed
      // the next solver from where the nodes actually are, not where they render).
      const x = this.simPositions[idx * 4];
      const y = this.simPositions[idx * 4 + 1];
      if (Number.isFinite(x) && Number.isFinite(y)) prevPos.set(id, { x, y });
    }
    // Capture the OUTGOING layout's settle state, temperature, and edge set before
    // teardown: the pin-authoritative warm path is only valid over a SETTLED prior
    // layout with an unchanged local topology, and both facts are gone after
    // disposeGraph (settle-on-swap audit — mid-settle captures are a resume point,
    // never an authoritative rest to pin).
    const priorSettled = this.solver ? this.solver.isSettled() : true;
    const priorAlpha = this.solver ? this.solver.alpha() : 0;
    const prevBuiltEdges = this.builtEdges;

    this.disposeGraph();

    this.nodes = nodes;
    this.hoveredId = null;
    this.visibleNodeIds = null;
    const n = nodes.length;
    if (n === 0) {
      this.requestRender();
      this.drawLabels();
      return;
    }

    const index = new Map<string, number>();
    nodes.forEach((node, i) => index.set(node.id, i));
    this.idToIndex = index;

    // adjacency + feature cohorts for hover emphasis
    this.neighbors = new Map();
    this.featureCohort = new Map();
    for (const node of nodes) {
      for (const tag of node.featureTags ?? []) {
        let set = this.featureCohort.get(tag);
        if (!set) this.featureCohort.set(tag, (set = new Set()));
        set.add(node.id);
      }
    }
    const addNbr = (a: string, b: string) => {
      let s = this.neighbors.get(a);
      if (!s) this.neighbors.set(a, (s = new Set()));
      s.add(b);
    };

    this.builtEdges = [];
    for (const e of edges) {
      const a = index.get(e.src);
      const b = index.get(e.dst);
      if (a === undefined || b === undefined || a === b) continue;
      this.builtEdges.push({ a, b, srcId: e.src, dstId: e.dst });
      addNbr(e.src, e.dst);
      addNbr(e.dst, e.src);
    }

    // Real node body radii drive forceCollide non-overlap (clean spacing).
    const radii = nodes.map((node) => nodeWorldRadius(node, this.appearance));
    this.solver = new D3ForceSolver(
      n,
      this.builtEdges.map((e) => ({ source: e.a, target: e.b })),
      radii,
      this.params,
    );
    const texSize = this.solver.texSize;

    // The DISPLAY positions ARE the texture's backing buffer: a single needsUpdate
    // re-uploads — no GPU readback. The solver packs into `simPositions` (physics
    // truth); the frame loop eases the display toward it (render-time lerp).
    this.cpuPositions = new Float32Array(texSize * texSize * 4);
    this.simPositions = new Float32Array(texSize * texSize * 4);
    this.positionTex = new DataTexture(
      this.cpuPositions,
      texSize,
      texSize,
      RGBAFormat,
      FloatType,
    );
    this.positionTex.minFilter = NearestFilter;
    this.positionTex.magFilter = NearestFilter;

    this.buildNodes(nodes, texSize);
    this.buildEdges(edges, index, texSize);

    // Warm-start: carry persisting nodes' positions over by id and seed each NEW node
    // next to a persisting neighbour (or near the carried centroid), so the solver
    // resumes the prior layout. WARM only when the carried set still DOMINATES (>= half
    // the nodes) — an expansion or live update — with NO camera refit so persistent
    // nodes barely move and the user's view is preserved; a FILTER reflow warms on ANY
    // carried id (a filter that hides most nodes must never re-explode + refit). COLD
    // otherwise (first load, a big partial-overlap change) — full off-screen prewarm +
    // a one-time camera fit — and ALWAYS on `reset` (a corpus switch's explicit cold
    // contract, no longer left to incidental id-disjointness). The classifier also
    // enforces the two warm-path preconditions the id-overlap gate cannot see
    // (settle-on-swap audit): survivors pin ONLY over a settled prior layout, and
    // changed-edge endpoints join the movable set so a same-id/different-edge swap
    // (relations facet, timeline as-of, live edge deltas) re-relaxes instead of
    // freezing the OLD topology's arrangement; the relax alpha ramps with the movable
    // fraction so a many-new swap cannot under-settle at the gentle warm energy.
    const swap = classifySwap({
      nodeIds: nodes.map((node) => node.id),
      carriedIds: new Set(prevPos.keys()),
      prevEdges: prevBuiltEdges.map((e) => ({ src: e.srcId, dst: e.dstId })),
      nextEdges: this.builtEdges.map((e) => ({ src: e.srcId, dst: e.dstId })),
      reflow,
      reset,
      priorSettled,
      warmStartAlpha: WARM_START_ALPHA,
      coldAlpha: COLD_START_ALPHA,
    });
    const warm = swap.warm;
    if (warm) {
      let carried = 0;
      let cx = 0;
      let cy = 0;
      for (const node of nodes) {
        const p = prevPos.get(node.id);
        if (p) {
          carried++;
          cx += p.x;
          cy += p.y;
        }
      }
      const centroid = { x: cx / carried, y: cy / carried };
      this.solver.seed((i) => {
        const node = nodes[i];
        const prev = prevPos.get(node.id);
        if (prev) return prev; // persistent → resume exact position
        // new node → next to a persisting neighbour (collide/forces separate it)
        for (const nb of this.neighbors.get(node.id) ?? []) {
          const np = prevPos.get(nb);
          if (np) return np;
        }
        // else a small deterministic golden-angle ring around the carried centroid, so a
        // BATCH of neighbourless new nodes does not seed coincident (coincident points
        // separate only slowly under the low warm alpha).
        const a = i * 2.399963229; // golden angle (radians)
        const r = 6 + (i % 7);
        return { x: centroid.x + Math.cos(a) * r, y: centroid.y + Math.sin(a) * r };
      });
    }
    // Off-screen settle before the first paint. The SETTLED LAYOUT IS AUTHORITATIVE:
    // a warm path over a settled prior layout — a filter reflow, an ego expansion, a
    // live delta, a same-scope re-fetch — PINS the carried survivors and relaxes only
    // the movable nodes (genuinely-new + changed-edge endpoints), so an additive
    // change never re-simulates an already-settled node (the graph is static unless a
    // node is explicitly dragged); a same-id-AND-same-edge update has nothing movable
    // and does ZERO ticks. Authority holds ONLY for rest: a swap landing while the
    // prior layout was still relaxing carries mid-settle positions, so it CONTINUES
    // the settle globally (seeded, unpinned, at the hotter of the carried temperature
    // and the proportional alpha) instead of pinning a half-converged tangle. A cold
    // load runs full energy + a one-time fit. A FROZEN sim preps the energy state
    // with zero ticks — the swap displays, and unfreeze resumes the pending settle —
    // so a background set-data can never tick through the user's freeze. If prewarm
    // hits its wall-clock budget the remainder finishes in the live loop; otherwise
    // it freezes (idle GPU 0).
    let prewarmTicks: number;
    if (warm && !swap.continueSettle) {
      prewarmTicks = this.solver.prewarmReflow(
        (i) => swap.movableIds.has(nodes[i].id),
        swap.startAlpha,
        this.frozen ? 0 : undefined,
      );
    } else if (warm) {
      prewarmTicks = this.solver.prewarm(
        this.frozen ? 0 : PREWARM_MAX_TICKS,
        PREWARM_BUDGET_MS,
        Math.max(swap.startAlpha, Math.min(priorAlpha, COLD_START_ALPHA)),
      );
    } else {
      // Persisted-base seed (graph-simulation-stability ADR): a COLD load (no
      // in-memory carry — first visit, corpus reset, scope switch) opens at the
      // last SETTLED equilibrium for this scope when one is persisted. Matching
      // ids seed their converged positions and the anneal merely relaxes the
      // topology diff, at a carry-proportional alpha (all-persisted ≈ the
      // gentle warm start; none ≈ the full cold explode). Node ids are
      // corpus-prefixed, so one per-scope blob serves both corpora.
      let persistedCarried = 0;
      const persisted =
        this.positionCache && this.persistWorkspace !== null
          ? this.positionCache.load(this.persistWorkspace, this.persistScope)
          : null;
      if (persisted && persisted.size > 0) {
        this.solver.seed((i) => {
          const p = persisted.get(nodes[i].id) ?? null;
          if (p) persistedCarried++;
          return p;
        });
      }
      const movableFraction = n > 0 ? (n - persistedCarried) / n : 1;
      const startAlpha = Math.min(
        COLD_START_ALPHA,
        WARM_START_ALPHA + (COLD_START_ALPHA - WARM_START_ALPHA) * movableFraction,
      );
      prewarmTicks = this.solver.prewarm(
        this.frozen ? 0 : PREWARM_MAX_TICKS,
        PREWARM_BUDGET_MS,
        startAlpha,
      );
    }
    // A data swap SNAPS the display to physics truth (no cross-swap glide between
    // unrelated geometries); the live loop's per-frame lerp takes over from here.
    this.solver.pack(this.simPositions);
    this.cpuPositions.set(this.simPositions);
    this.displayEasing = false;
    this.uploadPositions();
    // Fit the camera ONCE on a cold load; a warm update preserves the user's view.
    if (!warm) this.fitToView();
    // Off-slice focus arrival (#42): a pending focus target the ego-expand just
    // materialized now has a position — center on it (focusNode clears the pending id).
    if (this.pendingFocusId !== null && this.idToIndex.has(this.pendingFocusId)) {
      this.focusNode(this.pendingFocusId);
    }
    // A frozen sim never resumes ticking from a data swap (the pending settle waits
    // for unfreeze); otherwise run until the solver actually reaches rest.
    this.setRunning(!this.frozen && !this.solver.isSettled());
    // A swap that genuinely ticked and landed settled synchronously persists the
    // layout here (the live loop's settle-transition persist never fires for it);
    // a zero-tick same-topology swap writes nothing.
    if (prewarmTicks > 0 && !this.frozen && this.solver.isSettled()) {
      this.persistSettledLayout();
    }
    // A genuine state change (new corpus, filter reflow, ego expansion, explicit user
    // action) re-engages autoframe when it is on, so the new corpus reframes on
    // load/filter — releasing any prior selection-frame or manual-nav suspension (#13
    // arbitration). The cold path already framed via fitToView above; this prompt poll
    // handles the warm path and its deadband no-ops an unchanged frame.
    //
    // A DELTA-driven warm set-data (ambient SSE vault edits, folded in via applyDeltas) is
    // NOT such a state change (GIR-012): re-engaging on it would clear a user's manual-nav
    // suspension and yank the camera back to the whole-graph frame on any background edit.
    // Skip re-engagement for deltas — an engaged (unsuspended) autoframe still tracks the
    // new bounds via its interval poll, and a disengaged one stays where the user left it.
    if (!deltaDriven) this.reengageAutoframe();
    // Re-apply emphasis against the freshly-rebuilt geometry so a DURABLE focus survives
    // the data reload: the feature-cluster spotlight (re-derived from the rebuilt
    // `featureCohort`) and any active node selection re-dim their non-members instead of
    // resetting to a flat, un-spotlit graph (the aDim attribute is recreated at 0 here).
    this.applyEmphasis();
    this.requestRender();
    if (this.running) this.wake();
  }

  /** Live incremental update (apply-deltas): fold add/remove/change-by-id into the
   *  current node + edge set, then re-run setData — which warm-starts by id, so a
   *  delta updates the graph in place without re-exploding the layout. */
  protected applyDeltas(deltas: SceneDelta[]): void {
    if (!deltas || deltas.length === 0) return;
    // Fold via the shared helper so the field's set and the controller's held model
    // (nodeCount/edgeCount) fold identically (GIR-006).
    const { nodes, edges } = foldSceneDeltas(this.nodes, this.edgeData, deltas);
    // reflow=false (normal warm gate), deltaDriven=true so an ambient delta never
    // re-frames the camera (GIR-012).
    this.setData(nodes, edges, false, true);
  }

  /** Transient cross-highlight (pulse): briefly ring the named nodes, then clear —
   *  the timeline's event-click flash. Bounded by a single self-clearing timer. */
  protected pulseNodes(ids: ReadonlySet<string>): void {
    this.pulseIds = new Set(ids);
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
    this.requestRender();
    this.pulseTimer = window.setTimeout(() => {
      this.pulseTimer = 0;
      this.pulseIds = new Set();
      this.requestRender();
    }, 900);
  }

  /** Persistence scope (Stage calls this directly): keys the persisted
   *  settled-layout cache — the "pre-simulated base" a cold load opens at.
   *  Node ids are corpus-prefixed and scope-unique, so one per-scope blob
   *  serves both corpora. */
  setPersistenceScope(workspace: string, scope: string): void {
    this.persistWorkspace = workspace;
    this.persistScope = scope;
  }

  /** Persist the settled layout as the next cold load's base — called only on
   *  a genuine settle transition (the live loop's running→false edge, or a
   *  swap that ticked and landed settled synchronously). Merged over the
   *  scope's existing blob so the OTHER corpus's layout survives; the current
   *  view's entries take precedence under the cache's entry cap. Best-effort
   *  by design (the cache owns quota eviction and bounds). */
  protected persistSettledLayout(): void {
    if (!this.positionCache || this.persistWorkspace === null) return;
    if (!this.solver || this.idToIndex.size === 0) return;
    const merged = new Map<string, NodePosition>();
    for (const [id, idx] of this.idToIndex) {
      // Persist PHYSICS truth: at the settle transition the display may still be
      // mid-glide; the cache must hold the solver's converged positions.
      const x = this.simPositions[idx * 4];
      const y = this.simPositions[idx * 4 + 1];
      if (Number.isFinite(x) && Number.isFinite(y)) merged.set(id, { x, y });
    }
    const existing = this.positionCache.load(this.persistWorkspace, this.persistScope);
    for (const [id, p] of existing) {
      if (!merged.has(id)) merged.set(id, p);
    }
    this.positionCache.save(
      this.persistWorkspace,
      this.persistScope,
      merged,
      Date.now(),
    );
  }
}
