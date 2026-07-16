import {
  DataTexture,
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";
import {
  type SceneCommand,
  type SceneController,
  type SceneDelta,
  type SceneEdgeData,
  type SceneNodeData,
} from "../../sceneController";
import { APPEARANCE_DEFAULTS, type AppearanceParams } from "../appearance";
import { D3ForceSolver, D3_FORCE_DEFAULTS, type D3ForceParams } from "../d3ForceSolver";
import { defaultPositionCache } from "../../positionCache";
import { labelTextStyle } from "../labelStyle";
import { type GlyphAtlas } from "../glyphAtlas";
// ThreeField — a parallel three.js implementation of the SceneFieldRenderer seam,
// an alternative to CosmosField. 2D orthographic. Node positions are computed on
// the CPU by D3ForceSolver (d3-force) and mirrored into a small RGBA-float texture
// the node/edge vertex shaders sample by id — so the crisp instanced rendering is
// untouched while the solver is a plain, deterministic CPU simulation. The host
// owns the loop: it ticks the solver, uploads the position texture, and stops on
// settle (alpha < alphaMin) so the idle GPU cost is zero (render-on-demand).
//
// Init is FLICKER-FREE: the solver pre-warms off-screen (the violent early ticks
// run before the first paint), then the camera fits ONCE — the first visible frame
// is already at equilibrium, never an "explode then settle".
//
// Visual + interaction parity with cosmos: real token colours and node sizing
// (appearance.ts mirrors cosmosField), tier-coloured width-varying edges, theme
// background, pointer picking → hover/selection emphasis (greyout) + rings, crisp
// 2D-overlay labels with DOI/semantic-zoom culling, and the SceneEvent surface
// (hover/select/open/context-menu/camera-change) emitted through the controller.

/** Memoized 2D-overlay token→CSS derivations (SGR-006), keyed on theme epoch +
 *  root font size. */
export type OverlayThemeDerived = {
  epoch: number;
  fontPx: number;
  ink: string;
  accent: string;
  highlight: string;
  inkMuted: string;
  pillFill: string;
  pillBorder: string;
  featureStyle: ReturnType<typeof labelTextStyle>;
  docStyle: ReturnType<typeof labelTextStyle>;
};

// Settle is alpha-driven inside the solver: d3-force cools by alphaDecay each tick
// and the host freezes the loop once `solver.isSettled()` (alpha < alphaMin and not
// held warm by a drag). A drag holds the sim warm via alphaTarget, so it perturbs
// only its force-bearing neighbourhood; the rest of a settled graph stays put.

export interface BuiltEdge {
  a: number;
  b: number;
  srcId: string;
  dstId: string;
}

export abstract class ThreeFieldState {
  /** Set by the scene factory; hover/select/open events flow back through it. */
  controller: SceneController | null = null;

  protected renderer: WebGLRenderer | null = null;

  protected readonly scene = new Scene();

  protected readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);

  protected solver: D3ForceSolver | null = null;

  protected nodeMesh: Mesh | null = null;

  protected edgeMesh: Mesh | null = null;

  protected nodeMaterial: ShaderMaterial | null = null;

  protected edgeMaterial: ShaderMaterial | null = null;

  // Icon mode (graph-node-icons): a sibling glyph mesh + the shared doc-type-mark atlas.
  // The atlas is built lazily on first icon enable and cached across data swaps; the mesh
  // is rebuilt with each set-data alongside the node mesh. Null when icons have never been
  // turned on (or the host cannot build the texture).
  protected glyphMesh: Mesh | null = null;

  protected glyphMaterial: ShaderMaterial | null = null;

  protected glyphAtlas: GlyphAtlas | null = null;

  protected glyphAtlasFailed = false;

  // GPU mirror of the CPU positions (cpuPositions). The vertex shaders sample this
  // by node id; we flag it needsUpdate after every tick so three re-uploads it.
  protected positionTex: DataTexture | null = null;

  protected labelCanvas: HTMLCanvasElement | null = null;

  protected labelCtx: CanvasRenderingContext2D | null = null;

  // graph model (CPU side)
  protected nodes: SceneNodeData[] = [];

  // Per-node category colour (int RGB), indexed by node index — the source of truth
  // edges inherit their colour from (an edge never carries a flat tier/grey/black hue).
  protected nodeColors: number[] = [];

  protected builtEdges: BuiltEdge[] = [];

  // The rendered edge inputs (the `valid` filter of set-data), aligned 1:1 with
  // builtEdges and the per-edge quad block — kept so a live edge-appearance retune
  // can recompute width/opacity without a full rebuild.
  protected edgeData: SceneEdgeData[] = [];

  // Per-edge base opacity from edgeAppearance, before the visibility mask. The
  // displayed aAlpha is base × visibility, so an opacity retune and a filter compose
  // (and a retune never clobbers the filter's hidden edges).
  protected edgeBaseAlpha = new Float32Array(0);

  protected idToIndex = new Map<string, number>();

  protected neighbors = new Map<string, Set<string>>();

  protected featureCohort = new Map<string, Set<string>>();

  // DISPLAY positions: feeds the GPU texture, overlays, and picking. The frame loop
  // eases this toward `simPositions` (render-time lerp) so solver jitter is
  // time-averaged before it reaches the screen; snapped exact on settle/data swap.
  protected cpuPositions = new Float32Array(0);

  // PHYSICS-truth positions: the solver pack target. Warm-start carries, layout
  // persistence, and the next data swap's seed all read THIS, never the eased display.
  protected simPositions = new Float32Array(0);

  protected displayEasing = false;

  protected lastSimTs = 0;

  // interaction state
  protected hoveredId: string | null = null;

  protected selectedIds: ReadonlySet<string> = new Set();

  // DURABLE feature-cluster spotlight: the SELECTED FEATURE tag (feature-selection-global-
  // state). Stored as a tag — NOT a frozen id set — so the member cohort is re-derived from
  // `featureCohort` on every `setData`, surviving data refreshes. `null` = no feature spotlit.
  protected spotlightFeatureTag: string | null = null;

  protected pinnedIds: ReadonlySet<string> = new Set();

  protected visibleNodeIds: ReadonlySet<string> | null = null;

  // Emphasis cross-fade (emphasis-state-grammar ADR): per-node recede TARGETS; the frame
  // loop eases the displayed aDim toward them (EMPHASIS_FADE_TAU_MS) while `emphasisAnim`
  // holds the loop awake. Bounded: one float per node, reallocated with the node set.
  protected dimTarget = new Float32Array(0);

  protected emphasisAnim = false;

  protected lastEmphasisTs = 0;

  // Cluster-selection fence presence: eased 0..1 alpha on the same clock. `fenceTag` lags
  // the spotlight tag on clear so the fence can fade OUT over the departing cohort.
  protected fenceAlpha = 0;

  protected fenceTargetAlpha = 0;

  protected fenceTag: string | null = null;

  protected params: D3ForceParams = { ...D3_FORCE_DEFAULTS };

  protected appearance: AppearanceParams = { ...APPEARANCE_DEFAULTS };

  // Transient pulse cohort (pulse command): briefly ring these nodes, then clear.
  protected pulseIds: ReadonlySet<string> = new Set();

  protected pulseTimer = 0;

  protected running = false;

  protected frozen = false;

  protected needsRender = false;

  protected scheduled = false;

  protected raf = 0;

  // SGR-005 pointer-delta pick cache: the last hit test's screen point + result,
  // valid only while nothing that affects a pick (positions, camera, data, size)
  // has changed. `frame()` clears it on any dirty work and `setData` clears it on
  // a node-set change, so a reuse is provably against an unchanged scene.
  protected lastPickSx = NaN;

  protected lastPickSy = NaN;

  protected lastPickId: string | null = null;

  protected pickCacheValid = false;

  // GL-context-restore attempt counter (bounded retry on webglcontextrestored).
  protected glRestoreAttempts = 0;

  // FPS-adaptive LOD (perf hardening): EMA of render cost + a hysteresis-gated degraded flag.
  protected frameMsEma = 0;

  protected perfDegraded = false;

  // SGR-006: the 2D overlay passes (drawLabels/renderMinimap) re-derive token→CSS
  // hex strings + label text styles every frame, though they change only per THEME
  // and per UI scale. `themeEpoch` bumps on `refresh-theme`; the cache re-derives
  // when the epoch or the (cached) root font size changes — otherwise it is reused.
  protected themeEpoch = 0;

  protected overlayThemeCache: OverlayThemeDerived | null = null;

  protected width = 1;

  protected height = 1;

  protected dpr = 1;

  protected viewHeight = 600;

  protected seedRadius = 300;

  protected dragging = false;

  protected dragMoved = false;

  protected lastX = 0;

  protected lastY = 0;

  // Node drag: when a node is grabbed it is cursor-pinned in the solver and the
  // sim is held warm so its edges visibly pull neighbours along.
  protected dragNodeIndex = -1;

  protected dragActive = false;

  // Two-finger touch gesture (trackpad/touch QoL): while two fingers are down the
  // pointer-event pan is suppressed and the centroid drives pan + the spread drives
  // pinch-zoom. Torn down when fewer than two touches remain.
  protected touchGesture = false;

  protected lastTouchCentroid: { x: number; y: number } | null = null;

  protected lastTouchDist = 0;

  // Autoframe (graph-autoframe): when on (default), an interval polls the graph bounds and,
  // when the fit drifts beyond the deadband, sets an eased camera target the render loop
  // glides toward. Skipped while the user interacts; the timer is bounded + torn down.
  protected autoframe = true;

  protected autoframeTimer = 0;

  protected autoframeTarget: { x: number; y: number; zoom: number } | null = null;

  protected autoframedFrame: { x: number; y: number; zoom: number } | null = null;

  // Arbitration with a one-shot USER selection-frame (graph-follow-mode #13): a
  // `frame-nodes` selection-frame SUSPENDS whole-graph autoframe so it never yanks the
  // camera back off the user's focused subset. Cleared on the next DATA change (set-data)
  // or an explicit fit-all / autoframe re-enable — so autoframe resumes on load/data
  // change, never over a selection write.
  protected autoframeSuspended = false;

  // Off-slice focus (graph-follow-mode #42): a `focus-node` for a node NOT currently
  // mounted (a rail/activity-rail/search open whose ego-expand materializes it a fetch
  // later) is REMEMBERED as a single pending id and centered when it next arrives in a
  // set-data/merge. Cleared on arrival, or when a newer explicit focus/fit/selection
  // supersedes it. Bounded to ONE id.
  protected pendingFocusId: string | null = null;

  // --- minimap (overview navigator) ---------------------------------------
  // A chrome-hosted <canvas> the field draws a downscaled overview into (node dots
  // + the current-viewport rectangle), refreshed on every render frame (settle
  // ticks, camera moves, data changes) — bounded by the on-demand render model, no
  // separate loop. Pointer click/drag on it pans the main camera.
  protected minimapCanvas: HTMLCanvasElement | null = null;

  protected minimapCtx: CanvasRenderingContext2D | null = null;

  protected detachMinimap: (() => void) | null = null;

  // The last world→minimap transform, retained so a pointer on the minimap maps
  // back to world coordinates for camera panning.
  protected minimapView: { scale: number; cx: number; cy: number } | null = null;

  protected minimapDragging = false;

  // Persisted settled-layout base (graph-simulation-stability ADR): the bounded
  // LRU PositionCache (built in W01.P02.S08, wired here) keyed per workspace +
  // scope. In-memory warm-start still keys on node id; the cache is the
  // CROSS-SESSION base a cold load seeds from.
  protected positionCache = defaultPositionCache();

  protected persistWorkspace: string | null = null;

  protected persistScope: string | null = null;

  abstract mount(host: HTMLElement): void;
  protected abstract applyBackground(): void;
  abstract resize(width: number, height: number): void;
  abstract destroy(): void;
  protected abstract rebuildGLResources(): void;
  abstract command(cmd: SceneCommand): void;
  protected abstract refreshTheme(): void;
  protected abstract overlayTheme(): OverlayThemeDerived;
  protected abstract setData(
    nodes: SceneNodeData[],
    edges: SceneEdgeData[],
    reflow?: boolean,
    deltaDriven?: boolean,
    reset?: boolean,
  ): void;
  protected abstract applyDeltas(deltas: SceneDelta[]): void;
  protected abstract pulseNodes(ids: ReadonlySet<string>): void;
  abstract setPersistenceScope(workspace: string, scope: string): void;
  protected abstract persistSettledLayout(): void;
  protected abstract buildNodes(nodes: SceneNodeData[], texSize: number): void;
  protected abstract iconInk(which: "light" | "dark"): [number, number, number];
  protected abstract buildGlyphs(
    nodes: SceneNodeData[],
    texSize: number,
    aColor: Float32Array,
    aSize: Float32Array,
  ): void;
  protected abstract buildEdges(
    edges: SceneEdgeData[],
    index: Map<string, number>,
    texSize: number,
  ): void;
  protected abstract disposeGraph(): void;
  protected abstract disposeGlyphs(): void;
  protected abstract emphasisSet(): Set<string> | null;
  protected abstract applyEmphasis(): void;
  protected abstract applyVisibility(
    nodeIds: ReadonlySet<string>,
    edgeIds: ReadonlySet<string>,
  ): void;
  protected abstract applyEdgeAlpha(): void;
  protected abstract reheat(): void;
  protected abstract resume(): void;
  abstract reheatNow(): void;
  protected abstract uploadPositions(): void;
  abstract setForceParams(params: Partial<D3ForceParams>): void;
  abstract setAppearanceParams(params: Partial<AppearanceParams>): void;
  abstract diagnose(ticks: number): { alpha: number[]; meanDisplacement: number[] };
  protected abstract requestRender(): void;
  protected abstract setRunning(next: boolean): void;
  protected abstract wake(): void;
  protected abstract applyDisplayLerp(): void;
  protected abstract stepEmphasisFade(): void;
  protected abstract updatePerfLod(frameMs: number): void;
  protected abstract renderFrame(): void;
  protected abstract emitAnchors(): void;
  abstract refreshAnchors(): void;
  protected abstract drawLabels(): void;
  protected abstract drawFence(
    ctx: CanvasRenderingContext2D,
    accentCss: string,
    s: number,
    ppw: number,
  ): void;
  protected abstract drawLabelPill(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    fontPx: number,
    inkCss: string,
    fillCss: string,
    borderCss: string,
    s: number,
  ): void;
  protected abstract fitLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ): string;
  protected abstract labelVisible(node: SceneNodeData): boolean;
  protected abstract pixelsPerWorld(): number;
  protected abstract worldToScreen(i: number): { x: number; y: number } | null;
  protected abstract screenToWorld(sx: number, sy: number): { x: number; y: number };
  protected abstract fitToSeed(): void;
  protected abstract graphBounds(): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null;
  protected abstract fitToView(): void;
  protected abstract fitToNodes(ids: ReadonlySet<string>): void;
  protected abstract fitTargetForBounds(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ): { x: number; y: number; zoom: number };
  protected abstract frameBounds(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ): void;
  protected abstract setAutoframe(enabled: boolean): void;
  protected abstract startAutoframeTimer(): void;
  protected abstract stopAutoframeTimer(): void;
  protected abstract isUserInteracting(): boolean;
  protected abstract disengageAutoframeForUserNav(): void;
  protected abstract reengageAutoframe(): void;
  protected abstract autoframePoll(): void;
  protected abstract stepAutoframe(): boolean;
  protected abstract zoomBy(factor: number): void;
  protected abstract panCamera(dxWorld: number, dyWorld: number): void;
  protected abstract clientToScreen(cx: number, cy: number): [number, number];
  protected abstract touchCentroid(touches: TouchList): { x: number; y: number };
  protected abstract touchDistance(touches: TouchList): number;
  protected abstract zoomAtScreen(factor: number, sx: number, sy: number): void;
  protected abstract focusNode(id: string): void;
  protected abstract emitCameraChange(): void;
  abstract setMinimapCanvas(canvas: HTMLCanvasElement | null): void;
  protected abstract renderMinimap(): void;
  protected abstract attachMinimapInteraction(canvas: HTMLCanvasElement): () => void;
  protected abstract setHovered(id: string | null): void;
  protected abstract pickNodeAtScreen(sx: number, sy: number): string | null;
  protected abstract eventToScreen(ev: MouseEvent): [number, number];
  protected abstract startNodeDrag(index: number, sx: number, sy: number): void;
  protected abstract endNodeDrag(): void;
  protected abstract setCursor(c: string): void;
  protected abstract attachInteraction(el: HTMLElement): void;
}
