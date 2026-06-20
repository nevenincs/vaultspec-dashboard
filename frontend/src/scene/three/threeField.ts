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

import {
  BufferGeometry,
  CircleGeometry,
  Color,
  ColorManagement,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  FloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  type Texture,
  Uint32BufferAttribute,
  WebGLRenderer,
} from "three";

import {
  type SceneCommand,
  type SceneDelta,
  type SceneEdgeData,
  type SceneFieldRenderer,
  type SceneNodeData,
  type SceneController,
} from "../sceneController";
import { semanticLevel } from "../field/cameraCore";
import { controlNumber } from "./graphControlSchema";
import {
  accentColor,
  APPEARANCE_DEFAULTS,
  type AppearanceParams,
  canvasBackground,
  edgeAppearance,
  edgeEndColors,
  highlightColor,
  inkColor,
  inkMutedColor,
  nodeColorNumber,
  nodeWorldRadius,
} from "./appearance";
import { D3_FORCE_DEFAULTS, D3ForceSolver, type D3ForceParams } from "./d3ForceSolver";
import { labelTextStyle } from "./labelStyle";
import { uiScale } from "./uiScale";

// Pointer hit tolerance in screen px at the 16px rem basis; UI-scaled at use.
// Tweakable constants are read FROM the canonical control registry
// (graphControlSchema) so each has exactly ONE definition — never a schema entry plus
// a duplicate local const (the exact drift the registry exists to kill). Same values,
// single source of truth.
const PICK_RADIUS_PX = controlNumber("pickRadiusPx");
/** Gentle restart alpha for a warm-started (mostly-carried-over) layout — low so
 *  persistent nodes barely move while new nodes settle in (object constancy). */
const WARM_START_ALPHA = controlNumber("warmStartAlpha");
/** Cold-fit padding: the graph span is divided by this when framing (≈8% per edge). */
const FIT_PADDING_FACTOR = controlNumber("fitPaddingFactor");
/** Fractional inset of the minimap overview from the minimap canvas edges. */
const MINIMAP_INSET = controlNumber("minimapInset");
// Camera zoom band + step factors. This is the LIVE field clamp (cameraCore's
// MIN/MAX_SCALE is the retired Camera-class path; the registry names that drift).
const ZOOM_MIN = controlNumber("zoomMin");
const ZOOM_MAX = controlNumber("zoomMax");
const ZOOM_STEP_BUTTON = controlNumber("zoomStepButton");
const ZOOM_STEP_WHEEL = controlNumber("zoomStepWheel");

/** 0xRRGGBB int → a CSS "#rrggbb" string for canvas-2D (minimap) fills/strokes. */
function hexCss(n: number): string {
  return "#" + (n & 0xffffff).toString(16).padStart(6, "0");
}

// Settle is alpha-driven inside the solver: d3-force cools by alphaDecay each tick
// and the host freezes the loop once `solver.isSettled()` (alpha < alphaMin and not
// held warm by a drag). A drag holds the sim warm via alphaTarget, so it perturbs
// only its force-bearing neighbourhood; the rest of a settled graph stays put.

// Nodes are real instanced circle GEOMETRY (a unit disc, one instance per node),
// positioned from the GPU position texture and scaled by node radius. Crisp at any
// size (MSAA on the silhouette + an fwidth edge-AA on the fill) — unlike point
// sprites, which raster a soft bitmap disc and are size-capped by the GPU.
const NODE_VERTEX = /* glsl */ `
attribute float aIndex;
attribute float aSize;
attribute vec3 aColor;
attribute float aDim;
attribute float aHidden;
uniform sampler2D uPositions;
uniform float uTexSize;
uniform float uPixelsPerWorld;
varying vec3 vColor;
varying float vDim;
varying float vEdge;
varying float vAA;

// Nodes and edges share ONE reference frame: world-space, scaling with zoom, but
// each CLAMPED to an on-screen px band so it never vanishes when zoomed far out
// (min) nor balloons when zoomed far in (max) — the deck.gl radiusMin/MaxPixels +
// widthMin/MaxPixels pattern. This keeps the node↔edge proportion constant at every
// zoom (Obsidian/Cytoscape scale-together), fixing the prior mismatch where nodes
// scaled in world units but edges held a constant pixel width.
uniform float uPxScale;          // UI-scale (root font / 16): the screen-px band tracks the DOM
const float NODE_MIN_PX = 1.5;   // node radius never below 1.5 px (visible zoomed out)
const float NODE_MAX_PX = 240.0; // node radius never above 240 px (no balloon zoomed in)

void main() {
  vec2 uv = (vec2(mod(aIndex, uTexSize), floor(aIndex / uTexSize)) + 0.5) / uTexSize;
  vec2 center = texture2D(uPositions, uv).xy;
  float ppw = uPixelsPerWorld;
  // World radius → wanted on-screen px → clamp to the band → back to world.
  float pxWanted = aSize * ppw;
  float pxC = clamp(pxWanted, NODE_MIN_PX * uPxScale, NODE_MAX_PX * uPxScale);
  float radiusWorld = ppw > 0.0 ? pxC / ppw : aSize;
  float scale = aHidden > 0.5 ? 0.0 : radiusWorld;
  vec2 world = center + position.xy * scale;
  vColor = aColor;
  vDim = aDim;
  vEdge = length(position.xy); // 0 at centre → 1 at the rim
  // Analytic edge-AA band: ~1.5 screen px at the rim, from the CLAMPED on-screen px.
  vAA = pxC > 0.0 ? clamp(1.5 / pxC, 0.0, 0.5) : 0.01;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 0.0, 1.0);
}
`;

const NODE_FRAGMENT = /* glsl */ `
precision mediump float;
uniform vec3 uDimColor;
varying vec3 vColor;
varying float vDim;
varying float vEdge;
varying float vAA;

void main() {
  float alpha = 1.0 - smoothstep(1.0 - vAA, 1.0, vEdge);
  if (alpha <= 0.0) discard;
  vec3 col = vColor;
  if (vDim > 0.5) {
    col = mix(vColor, uDimColor, 0.72);
    alpha *= 0.4;
  }
  gl_FragColor = vec4(col, alpha);
}
`;

const EDGE_VERTEX = /* glsl */ `
attribute float aIndexA;
attribute float aIndexB;
attribute float aEnd;
attribute float aSide;
attribute float aWidthPx;
attribute vec3 aColor;
attribute float aAlpha;
attribute float aDim;
uniform sampler2D uPositions;
uniform float uTexSize;
uniform float uPixelsPerWorld;
varying vec3 vColor;
varying float vAlpha;
varying float vDim;

vec2 nodePos(float idx) {
  vec2 uv = (vec2(mod(idx, uTexSize), floor(idx / uTexSize)) + 0.5) / uTexSize;
  return texture2D(uPositions, uv).xy;
}

// Edge width shares the node frame: aWidthPx is read as a WORLD width, so it scales
// with zoom exactly like node radius (parity), then floored/capped on screen so an
// edge never disappears when zoomed far out (deck.gl widthMinPixels; sigma
// minEdgeThickness) nor dominates when zoomed in. NOTE: aWidthPx now carries WORLD
// units, not pixels — the attribute name is kept to avoid churn in the edge build.
uniform float uPxScale;         // UI-scale (root font / 16): the screen-px band tracks the DOM
const float EDGE_MIN_PX = 1.0;  // edge never thinner than 1 px (won't vanish)
const float EDGE_MAX_PX = 64.0; // edge never thicker than 64 px (no balloon)

void main() {
  vec2 a = nodePos(aIndexA);
  vec2 b = nodePos(aIndexB);
  vec2 base = mix(a, b, aEnd);
  vec2 dir = b - a;
  float len = length(dir);
  vec2 nrm = len > 0.0001 ? vec2(-dir.y, dir.x) / len : vec2(0.0);
  float ppw = uPixelsPerWorld;
  float pxWanted = aWidthPx * ppw; // world width → on-screen px (scales with zoom)
  float pxC = clamp(pxWanted, EDGE_MIN_PX * uPxScale, EDGE_MAX_PX * uPxScale);
  float halfWorld = ppw > 0.0 ? (pxC * 0.5) / ppw : aWidthPx * 0.5;
  vec2 world = base + nrm * aSide * halfWorld;
  vColor = aColor;
  vAlpha = aAlpha;
  vDim = aDim;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 0.0, 1.0);
}
`;

const EDGE_FRAGMENT = /* glsl */ `
precision mediump float;
uniform vec3 uDimColor;
varying vec3 vColor;
varying float vAlpha;
varying float vDim;

void main() {
  vec3 col = vColor;
  float a = vAlpha;
  if (vDim > 0.5) {
    col = mix(vColor, uDimColor, 0.6);
    a *= 0.2;
  }
  gl_FragColor = vec4(col, a);
}
`;

interface BuiltEdge {
  a: number;
  b: number;
  srcId: string;
  dstId: string;
}

export class ThreeField implements SceneFieldRenderer {
  /** Set by the scene factory; hover/select/open events flow back through it. */
  controller: SceneController | null = null;

  private renderer: WebGLRenderer | null = null;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);

  private solver: D3ForceSolver | null = null;
  private nodeMesh: Mesh | null = null;
  private edgeMesh: Mesh | null = null;
  private nodeMaterial: ShaderMaterial | null = null;
  private edgeMaterial: ShaderMaterial | null = null;
  // GPU mirror of the CPU positions (cpuPositions). The vertex shaders sample this
  // by node id; we flag it needsUpdate after every tick so three re-uploads it.
  private positionTex: DataTexture | null = null;
  private labelCanvas: HTMLCanvasElement | null = null;
  private labelCtx: CanvasRenderingContext2D | null = null;

  // graph model (CPU side)
  private nodes: SceneNodeData[] = [];
  // Per-node category colour (int RGB), indexed by node index — the source of truth
  // edges inherit their colour from (an edge never carries a flat tier/grey/black hue).
  private nodeColors: number[] = [];
  private builtEdges: BuiltEdge[] = [];
  // The rendered edge inputs (the `valid` filter of set-data), aligned 1:1 with
  // builtEdges and the per-edge quad block — kept so a live edge-appearance retune
  // can recompute width/opacity without a full rebuild.
  private edgeData: SceneEdgeData[] = [];
  // Per-edge base opacity from edgeAppearance, before the visibility mask. The
  // displayed aAlpha is base × visibility, so an opacity retune and a filter compose
  // (and a retune never clobbers the filter's hidden edges).
  private edgeBaseAlpha = new Float32Array(0);
  private idToIndex = new Map<string, number>();
  private neighbors = new Map<string, Set<string>>();
  private featureCohort = new Map<string, Set<string>>();
  private cpuPositions = new Float32Array(0);

  // interaction state
  private hoveredId: string | null = null;
  private selectedIds: ReadonlySet<string> = new Set();
  private pinnedIds: ReadonlySet<string> = new Set();
  private visibleNodeIds: ReadonlySet<string> | null = null;

  private params: D3ForceParams = { ...D3_FORCE_DEFAULTS };
  private appearance: AppearanceParams = { ...APPEARANCE_DEFAULTS };
  // Transient pulse cohort (pulse command): briefly ring these nodes, then clear.
  private pulseIds: ReadonlySet<string> = new Set();
  private pulseTimer = 0;
  private running = false;
  private frozen = false;
  private needsRender = false;
  private scheduled = false;
  private raf = 0;

  private width = 1;
  private height = 1;
  private dpr = 1;
  private viewHeight = 600;
  private seedRadius = 300;

  private dragging = false;
  private dragMoved = false;
  private lastX = 0;
  private lastY = 0;
  // Node drag: when a node is grabbed it is cursor-pinned in the solver and the
  // sim is held warm so its edges visibly pull neighbours along.
  private dragNodeIndex = -1;
  private dragActive = false;

  // --- minimap (overview navigator) ---------------------------------------
  // A chrome-hosted <canvas> the field draws a downscaled overview into (node dots
  // + the current-viewport rectangle), refreshed on every render frame (settle
  // ticks, camera moves, data changes) — bounded by the on-demand render model, no
  // separate loop. Pointer click/drag on it pans the main camera.
  private minimapCanvas: HTMLCanvasElement | null = null;
  private minimapCtx: CanvasRenderingContext2D | null = null;
  private detachMinimap: (() => void) | null = null;
  // The last world→minimap transform, retained so a pointer on the minimap maps
  // back to world coordinates for camera panning.
  private minimapView: { scale: number; cx: number; cy: number } | null = null;
  private minimapDragging = false;

  mount(host: HTMLElement): void {
    // Colour-space contract: the scene's category/tier/ink tokens are authored as
    // sRGB literal hex (themes-are-oklch-generated-from-a-token-tier) and every other
    // scene consumer paints them as sRGB PASSTHROUGH — cosmos via `rgba()` (raw bytes
    // /255), Pixi, and this field's own canvas-2D label overlay. three.js's default
    // (ColorManagement on) is the outlier: `Color.set(hex)` would convert the sRGB
    // token to LINEAR, and because our custom ShaderMaterials write gl_FragColor
    // directly (no built-in linearToOutputTexel re-encode), that linear value lands on
    // the sRGB canvas and renders visibly DARKER than the declared token. Disabling
    // colour management aligns three with the scene-wide sRGB-passthrough contract, so
    // node/edge/dim/background colours match the tokens (and cosmos) exactly. Safe and
    // contained: three is imported only by this field.
    ColorManagement.enabled = false;

    const renderer = new WebGLRenderer({ antialias: true, alpha: false });
    this.dpr = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(this.dpr);
    host.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, {
      display: "block",
      width: "100%",
      height: "100%",
      position: "absolute",
      inset: "0",
    });
    this.renderer = renderer;

    const labels = document.createElement("canvas");
    Object.assign(labels.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
    });
    host.appendChild(labels);
    this.labelCanvas = labels;
    this.labelCtx = labels.getContext("2d");

    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);
    this.applyBackground();
    this.attachInteraction(renderer.domElement);

    const rect = host.getBoundingClientRect();
    this.resize(rect.width || 1, rect.height || 1);

    (window as unknown as { __threeField?: ThreeField }).__threeField = this;
  }

  private applyBackground(): void {
    this.renderer?.setClearColor(canvasBackground(), 1);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer?.setSize(this.width, this.height, false);
    if (this.labelCanvas) {
      this.labelCanvas.width = Math.round(this.width * this.dpr);
      this.labelCanvas.height = Math.round(this.height * this.dpr);
    }
    const aspect = this.width / this.height;
    const halfH = this.viewHeight / 2;
    const halfW = halfH * aspect;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  destroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
    this.pulseTimer = 0;
    this.scheduled = false;
    this.disposeGraph();
    this.detachMinimap?.();
    this.detachMinimap = null;
    this.minimapCanvas = null;
    this.minimapCtx = null;
    this.labelCanvas?.remove();
    this.labelCanvas = null;
    this.labelCtx = null;
    if (this.renderer) {
      this.renderer.domElement.remove();
      this.renderer.dispose();
      this.renderer = null;
    }
    const g = window as unknown as { __threeField?: ThreeField };
    if (g.__threeField === this) delete g.__threeField;
  }

  command(cmd: SceneCommand): void {
    switch (cmd.kind) {
      case "set-data":
        this.setData(cmd.nodes, cmd.edges);
        break;
      case "set-selected":
        this.selectedIds = new Set(cmd.ids);
        this.applyEmphasis();
        this.requestRender();
        break;
      case "set-pinned":
        this.pinnedIds = new Set(cmd.ids);
        this.requestRender();
        break;
      case "set-visibility":
        this.visibleNodeIds = new Set(cmd.visibleNodeIds);
        this.applyVisibility(cmd.visibleNodeIds, cmd.visibleEdgeIds);
        this.requestRender();
        break;
      case "focus-node":
        this.focusNode(cmd.id);
        break;
      case "set-simulation-active":
        // Resume/pause is energy-neutral: just toggle ticking, never re-pump heat.
        // (A fresh layout reheats via set-data; an explicit restart via reheatNow.)
        if (cmd.active) this.resume();
        else this.running = false;
        break;
      case "set-frozen":
        this.frozen = cmd.frozen;
        if (cmd.frozen) this.running = false;
        else this.resume();
        break;
      case "fit-to-view":
      case "reset-view":
        this.fitToView();
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
      default:
        break;
    }
  }

  // --- data ----------------------------------------------------------------

  private setData(nodes: SceneNodeData[], edges: SceneEdgeData[]): void {
    if (!this.renderer) return;

    // Warm-start (object constancy): capture the PRIOR layout by id BEFORE teardown,
    // so nodes that persist across this set-data resume from where they were instead
    // of re-exploding. The app re-sends set-data on every working-set expansion and
    // live update; without this the graph re-explodes each time.
    const prevPos = new Map<string, { x: number; y: number }>();
    for (const [id, idx] of this.idToIndex) {
      const x = this.cpuPositions[idx * 4];
      const y = this.cpuPositions[idx * 4 + 1];
      if (Number.isFinite(x) && Number.isFinite(y)) prevPos.set(id, { x, y });
    }

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

    // The CPU positions ARE the texture's backing buffer: pack() writes into it and
    // a single needsUpdate re-uploads — no per-frame copy and no GPU readback.
    this.cpuPositions = new Float32Array(texSize * texSize * 4);
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
    // the nodes) — an expansion or live update — with gentle alpha + NO camera refit so
    // persistent nodes barely move and the user's view is preserved. COLD otherwise
    // (first load, scope/lens switch, or a big partial-overlap change) — full off-screen
    // prewarm + a one-time camera fit. The >=half gate matters: a partial-overlap that
    // shares just a few ids must NOT warm, or its many new nodes under-settle at the low
    // warm alpha into an off-screen clump with no refit (review: warm-start threshold).
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
    const warm = nodes.length > 0 && carried >= 0.5 * nodes.length;
    if (warm) {
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
    // Off-screen settle before the first paint: gentle when warm-started, full energy
    // when cold. If prewarm hits its wall-clock budget the remainder finishes in the
    // live loop; otherwise it freezes (idle GPU 0).
    this.solver.prewarm(undefined, undefined, warm ? WARM_START_ALPHA : undefined);
    this.solver.pack(this.cpuPositions);
    this.uploadPositions();
    // Fit the camera ONCE on a cold load; a warm update preserves the user's view.
    if (!warm) this.fitToView();
    this.running = !this.solver.isSettled();
    this.requestRender();
    if (this.running) this.wake();
  }

  /** Live incremental update (apply-deltas): fold add/remove/change-by-id into the
   *  current node + edge set, then re-run setData — which warm-starts by id, so a
   *  delta updates the graph in place without re-exploding the layout. */
  private applyDeltas(deltas: SceneDelta[]): void {
    if (!deltas || deltas.length === 0) return;
    const nodeMap = new Map(this.nodes.map((n) => [n.id, n] as const));
    const edgeMap = new Map(this.edgeData.map((e) => [e.id, e] as const));
    for (const d of deltas) {
      if (d.op === "remove") {
        if (d.node) nodeMap.delete(d.node.id);
        if (d.edge) edgeMap.delete(d.edge.id);
      } else {
        if (d.node) nodeMap.set(d.node.id, d.node);
        if (d.edge) edgeMap.set(d.edge.id, d.edge);
      }
    }
    this.setData([...nodeMap.values()], [...edgeMap.values()]);
  }

  /** Transient cross-highlight (pulse): briefly ring the named nodes, then clear —
   *  the timeline's event-click flash. Bounded by a single self-clearing timer. */
  private pulseNodes(ids: ReadonlySet<string>): void {
    this.pulseIds = new Set(ids);
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
    this.requestRender();
    this.pulseTimer = window.setTimeout(() => {
      this.pulseTimer = 0;
      this.pulseIds = new Set();
      this.requestRender();
    }, 900);
  }

  /** Persistence scope (Stage calls this directly). No-op: warm-start keys on node
   *  id, which is already scope-unique — a scope switch yields a disjoint id set, so
   *  setData takes the cold path automatically. Mirrors CosmosField's no-op. */
  setPersistenceScope(_workspace: string, _scope: string): void {}

  private buildNodes(nodes: SceneNodeData[], texSize: number): void {
    const n = nodes.length;
    const aIndex = new Float32Array(n);
    const aSize = new Float32Array(n);
    const aColor = new Float32Array(n * 3);
    const aDim = new Float32Array(n);
    const aHidden = new Float32Array(n);
    const tmp = new Color();
    this.nodeColors = new Array<number>(n);
    nodes.forEach((node, i) => {
      aIndex[i] = i;
      aSize[i] = nodeWorldRadius(node, this.appearance);
      const col = nodeColorNumber(node);
      this.nodeColors[i] = col;
      tmp.set(col);
      aColor[i * 3] = tmp.r;
      aColor[i * 3 + 1] = tmp.g;
      aColor[i * 3 + 2] = tmp.b;
    });

    // Unit disc base geometry, instanced once per node. 48 segments + the fwidth
    // fill-AA keeps the silhouette smooth even at large feature-node radii.
    const disc = new CircleGeometry(1, 48);
    const geom = new InstancedBufferGeometry();
    geom.index = disc.index;
    geom.setAttribute("position", disc.getAttribute("position"));
    geom.setAttribute("aIndex", new InstancedBufferAttribute(aIndex, 1));
    geom.setAttribute("aSize", new InstancedBufferAttribute(aSize, 1));
    geom.setAttribute("aColor", new InstancedBufferAttribute(aColor, 3));
    geom.setAttribute("aDim", new InstancedBufferAttribute(aDim, 1));
    geom.setAttribute("aHidden", new InstancedBufferAttribute(aHidden, 1));
    geom.instanceCount = n;

    const dim = new Color(inkMutedColor());
    this.nodeMaterial = new ShaderMaterial({
      uniforms: {
        uPositions: { value: null as Texture | null },
        uTexSize: { value: texSize },
        uPixelsPerWorld: { value: this.pixelsPerWorld() },
        uDimColor: { value: [dim.r, dim.g, dim.b] },
        uPxScale: { value: uiScale() },
      },
      vertexShader: NODE_VERTEX,
      fragmentShader: NODE_FRAGMENT,
      transparent: true,
      depthTest: false,
    });

    this.nodeMesh = new Mesh(geom, this.nodeMaterial);
    this.nodeMesh.frustumCulled = false;
    this.nodeMesh.renderOrder = 1;
    this.scene.add(this.nodeMesh);
  }

  private buildEdges(
    edges: SceneEdgeData[],
    index: Map<string, number>,
    texSize: number,
  ): void {
    const valid = edges.filter(
      (e) => index.has(e.src) && index.has(e.dst) && e.src !== e.dst,
    );
    // Retain the rendered edge inputs + a base-opacity buffer for live retuning.
    this.edgeData = valid;
    this.edgeBaseAlpha = new Float32Array(valid.length);
    if (valid.length === 0) return;

    const quad = valid.length * 4;
    const aIndexA = new Float32Array(quad);
    const aIndexB = new Float32Array(quad);
    const aEnd = new Float32Array(quad);
    const aSide = new Float32Array(quad);
    const aWidthPx = new Float32Array(quad);
    const aColor = new Float32Array(quad * 3);
    const aAlpha = new Float32Array(quad);
    const aDim = new Float32Array(quad);
    const indices = new Uint32Array(valid.length * 6);
    const colA = new Color();
    const colB = new Color();

    valid.forEach((e, i) => {
      const s = index.get(e.src) as number;
      const t = index.get(e.dst) as number;
      const ap = edgeAppearance(e, this.appearance);
      this.edgeBaseAlpha[i] = ap.alpha;
      // Inherit colour from the endpoint nodes (never a flat tier/grey/black edge):
      // solid → both ends the source (leaf) hue; gradient → leaf→parent blend that
      // the shader interpolates across the quad (A verts = source, B verts = target).
      const endColors = edgeEndColors(
        this.appearance.edgeColorMode,
        this.nodeColors[s],
        this.nodeColors[t],
      );
      colA.set(endColors.a);
      colB.set(endColors.b);
      // 4 verts: 0=A-left,1=A-right,2=B-left,3=B-right
      const endT = [0, 0, 1, 1];
      const sides = [-1, 1, -1, 1];
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        aIndexA[v] = s;
        aIndexB[v] = t;
        aEnd[v] = endT[k];
        aSide[v] = sides[k];
        aWidthPx[v] = ap.width;
        const c = k < 2 ? colA : colB;
        aColor[v * 3] = c.r;
        aColor[v * 3 + 1] = c.g;
        aColor[v * 3 + 2] = c.b;
        aAlpha[v] = ap.alpha;
      }
      const base = i * 4;
      indices.set([base, base + 1, base + 2, base + 1, base + 3, base + 2], i * 6);
    });

    const geom = new BufferGeometry();
    geom.setAttribute(
      "position",
      new Float32BufferAttribute(new Float32Array(quad * 3), 3),
    );
    geom.setAttribute("aIndexA", new Float32BufferAttribute(aIndexA, 1));
    geom.setAttribute("aIndexB", new Float32BufferAttribute(aIndexB, 1));
    geom.setAttribute("aEnd", new Float32BufferAttribute(aEnd, 1));
    geom.setAttribute("aSide", new Float32BufferAttribute(aSide, 1));
    geom.setAttribute("aWidthPx", new Float32BufferAttribute(aWidthPx, 1));
    geom.setAttribute("aColor", new Float32BufferAttribute(aColor, 3));
    geom.setAttribute("aAlpha", new Float32BufferAttribute(aAlpha, 1));
    geom.setAttribute("aDim", new Float32BufferAttribute(aDim, 1));
    geom.setIndex(new Uint32BufferAttribute(indices, 1));

    const dim = new Color(inkMutedColor());
    this.edgeMaterial = new ShaderMaterial({
      uniforms: {
        uPositions: { value: null as Texture | null },
        uTexSize: { value: texSize },
        uPixelsPerWorld: { value: this.pixelsPerWorld() },
        uDimColor: { value: [dim.r, dim.g, dim.b] },
        uPxScale: { value: uiScale() },
      },
      vertexShader: EDGE_VERTEX,
      fragmentShader: EDGE_FRAGMENT,
      transparent: true,
      depthTest: false,
      side: DoubleSide,
    });

    this.edgeMesh = new Mesh(geom, this.edgeMaterial);
    this.edgeMesh.frustumCulled = false;
    this.edgeMesh.renderOrder = 0;
    this.scene.add(this.edgeMesh);
  }

  private disposeGraph(): void {
    if (this.nodeMesh) {
      this.scene.remove(this.nodeMesh);
      this.nodeMesh.geometry.dispose();
      this.nodeMesh = null;
    }
    if (this.edgeMesh) {
      this.scene.remove(this.edgeMesh);
      this.edgeMesh.geometry.dispose();
      this.edgeMesh = null;
    }
    this.nodeMaterial?.dispose();
    this.edgeMaterial?.dispose();
    this.nodeMaterial = null;
    this.edgeMaterial = null;
    this.positionTex?.dispose();
    this.positionTex = null;
    this.solver?.dispose();
    this.solver = null;
    this.nodes = [];
    this.nodeColors = [];
    this.builtEdges = [];
    this.edgeData = [];
    this.edgeBaseAlpha = new Float32Array(0);
  }

  // --- emphasis / visibility -----------------------------------------------

  /** Active emphasis set (hover takes precedence; else shared selection). */
  private emphasisSet(): Set<string> | null {
    if (this.hoveredId) {
      const set = new Set<string>([this.hoveredId]);
      for (const nb of this.neighbors.get(this.hoveredId) ?? []) set.add(nb);
      const node = this.nodes[this.idToIndex.get(this.hoveredId) ?? -1];
      for (const tag of node?.featureTags ?? []) {
        for (const id of this.featureCohort.get(tag) ?? []) set.add(id);
      }
      return set;
    }
    if (this.selectedIds.size > 0) {
      const set = new Set<string>(this.selectedIds);
      for (const id of this.selectedIds) {
        for (const nb of this.neighbors.get(id) ?? []) set.add(nb);
      }
      return set;
    }
    return null;
  }

  private applyEmphasis(): void {
    if (!this.nodeMesh || !this.edgeMesh) return;
    const active = this.emphasisSet();
    const nodeDim = this.nodeMesh.geometry.getAttribute("aDim");
    for (let i = 0; i < this.nodes.length; i++) {
      nodeDim.setX(i, active && !active.has(this.nodes[i].id) ? 1 : 0);
    }
    nodeDim.needsUpdate = true;

    const edgeDim = this.edgeMesh.geometry.getAttribute("aDim");
    this.builtEdges.forEach((e, i) => {
      const lit = !active || (active.has(e.srcId) && active.has(e.dstId));
      for (let k = 0; k < 4; k++) edgeDim.setX(i * 4 + k, lit ? 0 : 1);
    });
    edgeDim.needsUpdate = true;
  }

  private applyVisibility(
    nodeIds: ReadonlySet<string>,
    edgeIds: ReadonlySet<string>,
  ): void {
    if (!this.nodeMesh || !this.edgeMesh) return;
    const hidden = this.nodeMesh.geometry.getAttribute("aHidden");
    for (let i = 0; i < this.nodes.length; i++) {
      hidden.setX(i, nodeIds.has(this.nodes[i].id) ? 0 : 1);
    }
    hidden.needsUpdate = true;
    // edgeIds membership is by edge id; we kept only endpoint ids, so visibility
    // falls back to endpoint membership (both endpoints visible ⇒ shown). Apply the
    // edge alpha from the retained base opacity gated by that mask.
    void edgeIds;
    this.applyEdgeAlpha();
  }

  /** Write every edge quad's displayed alpha from its retained base opacity gated by
   *  the current visibility mask, so an opacity retune and a filter compose (and a
   *  retune never clobbers a hidden edge). */
  private applyEdgeAlpha(): void {
    if (!this.edgeMesh) return;
    const alpha = this.edgeMesh.geometry.getAttribute("aAlpha");
    const vis = this.visibleNodeIds;
    this.builtEdges.forEach((e, i) => {
      const shown = !vis || (vis.has(e.srcId) && vis.has(e.dstId));
      const a = shown ? (this.edgeBaseAlpha[i] ?? 0) : 0;
      for (let k = 0; k < 4; k++) alpha.setX(i * 4 + k, a);
    });
    alpha.needsUpdate = true;
  }

  // --- render loop ---------------------------------------------------------

  /** Cold restart — a full re-explode of the current data (explicit reheat). */
  private reheat(): void {
    if (this.frozen || !this.solver) return;
    this.solver.reheat(true);
    this.running = true;
    this.wake();
  }

  /** Resume / warm re-energise (pause→resume, freeze→unfreeze). A settled graph
   *  nudged warm re-cools and re-freezes on its own. */
  private resume(): void {
    if (this.frozen || !this.solver) return;
    this.solver.reheat(false);
    this.running = true;
    this.wake();
  }

  reheatNow(): void {
    this.reheat();
  }

  /** Flag the position texture for re-upload after pack() writes cpuPositions. */
  private uploadPositions(): void {
    if (this.positionTex) this.positionTex.needsUpdate = true;
  }

  /** Re-tune the force parameters live (graph-lab knob set) and gently reheat. */
  setForceParams(params: Partial<D3ForceParams>): void {
    this.params = { ...this.params, ...params };
    if (this.solver) {
      this.solver.setParams(this.params);
      this.running = true;
      this.wake();
    }
  }

  /**
   * Re-tune the LOOK live (node module size, edge width/opacity) — the appearance
   * sibling of setForceParams. Edge changes just rewrite the instanced width/alpha
   * attributes with NO re-simulation (cheap). A node-SIZE change also re-feeds the
   * solver's collide radii so non-overlap spacing tracks the drawn size, which does
   * gently reheat — node size is both look and collision body, so it cannot be a
   * pure attribute rewrite. A change that touches neither (no-op) costs nothing.
   */
  setAppearanceParams(params: Partial<AppearanceParams>): void {
    const prev = this.appearance;
    this.appearance = { ...prev, ...params };

    const sizeChanged =
      this.appearance.nodeSizeScale !== prev.nodeSizeScale ||
      this.appearance.nodeSalienceScale !== prev.nodeSalienceScale;
    const edgeChanged =
      this.appearance.edgeWidthMin !== prev.edgeWidthMin ||
      this.appearance.edgeWidthMax !== prev.edgeWidthMax ||
      this.appearance.edgeOpacityMin !== prev.edgeOpacityMin ||
      this.appearance.edgeOpacityMax !== prev.edgeOpacityMax ||
      this.appearance.edgeColorMode !== prev.edgeColorMode;

    if (sizeChanged && this.nodeMesh) {
      const aSize = this.nodeMesh.geometry.getAttribute("aSize");
      for (let i = 0; i < this.nodes.length; i++) {
        aSize.setX(i, nodeWorldRadius(this.nodes[i], this.appearance));
      }
      aSize.needsUpdate = true;
      // Node size is the collision body too: re-feed collide radii so spacing tracks
      // the drawn size (the solver rebuilds collide + gently reheats).
      if (this.solver) {
        this.solver.setRadii(
          this.nodes.map((node) => nodeWorldRadius(node, this.appearance)),
        );
        this.running = true;
        this.wake();
      }
    }

    if (edgeChanged && this.edgeMesh && this.edgeData.length > 0) {
      const aWidth = this.edgeMesh.geometry.getAttribute("aWidthPx");
      const aColor = this.edgeMesh.geometry.getAttribute("aColor");
      const colA = new Color();
      const colB = new Color();
      this.edgeData.forEach((e, i) => {
        const ap = edgeAppearance(e, this.appearance);
        this.edgeBaseAlpha[i] = ap.alpha;
        const s = this.idToIndex.get(e.src) ?? 0;
        const t = this.idToIndex.get(e.dst) ?? 0;
        const endColors = edgeEndColors(
          this.appearance.edgeColorMode,
          this.nodeColors[s],
          this.nodeColors[t],
        );
        colA.set(endColors.a);
        colB.set(endColors.b);
        for (let k = 0; k < 4; k++) {
          aWidth.setX(i * 4 + k, ap.width);
          const c = k < 2 ? colA : colB;
          aColor.setXYZ(i * 4 + k, c.r, c.g, c.b);
        }
      });
      aWidth.needsUpdate = true;
      aColor.needsUpdate = true;
      this.applyEdgeAlpha();
    }

    this.requestRender();
  }

  /**
   * Tick-level dynamics snapshot (bypasses the rAF loop): single-steps `ticks`
   * iterations and returns per-tick alpha (the cooling schedule) and mean per-node
   * displacement (→0 at rest — the jitter/instability signature). Updates the view
   * and leaves the loop stopped.
   */
  diagnose(ticks: number): { alpha: number[]; meanDisplacement: number[] } {
    const out = { alpha: [] as number[], meanDisplacement: [] as number[] };
    if (!this.solver) return out;
    this.running = false;
    for (let t = 0; t < ticks; t++) {
      const m = this.solver.tick();
      out.alpha.push(+m.alpha.toFixed(5));
      out.meanDisplacement.push(+m.meanDisplacement.toFixed(4));
    }
    this.solver.pack(this.cpuPositions);
    this.uploadPositions();
    this.requestRender();
    return out;
  }

  private requestRender(): void {
    this.needsRender = true;
    this.wake();
  }

  private wake(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (): void => {
    this.scheduled = false;
    let dirty = this.needsRender;
    this.needsRender = false;

    if (this.solver && this.running) {
      // One d3-force tick on the CPU, then mirror positions into the GPU texture.
      // Freeze when the solver has cooled below alphaMin (and no drag holds it
      // warm) — a real convergence stop that idles the GPU to zero.
      this.solver.tick();
      this.solver.pack(this.cpuPositions);
      this.uploadPositions();
      if (!this.dragActive && this.solver.isSettled()) this.running = false;
      dirty = true;
    }

    if (dirty) this.renderFrame();
    if (this.running || this.needsRender) this.wake();
  };

  private renderFrame(): void {
    if (!this.renderer) return;
    const tex = this.positionTex;
    const ppw = this.pixelsPerWorld();
    const pxScale = uiScale();
    if (this.nodeMaterial) {
      this.nodeMaterial.uniforms.uPositions.value = tex;
      this.nodeMaterial.uniforms.uPixelsPerWorld.value = ppw;
      this.nodeMaterial.uniforms.uPxScale.value = pxScale;
    }
    if (this.edgeMaterial) {
      this.edgeMaterial.uniforms.uPositions.value = tex;
      this.edgeMaterial.uniforms.uPixelsPerWorld.value = ppw;
      this.edgeMaterial.uniforms.uPxScale.value = pxScale;
    }
    this.renderer.render(this.scene, this.camera);
    this.drawLabels();
    this.emitAnchors();
    this.renderMinimap();
  }

  // --- anchors (RL-4: DOM islands + hover card) ----------------------------

  /** For every node a consumer is tracking (opened islands, hover card), emit its
   *  screen-space anchor each render so the DOM overlay follows it; emit null when
   *  the node is gone or off the viewport so the overlay hides. Mirrors CosmosField's
   *  per-frame trackedNodeIds → emitAnchor pass. */
  private emitAnchors(): void {
    const ctrl = this.controller;
    if (!ctrl) return;
    const scale = this.camera.zoom;
    for (const id of ctrl.trackedNodeIds()) {
      const i = this.idToIndex.get(id);
      const p = i === undefined ? null : this.worldToScreen(i);
      if (!p || p.x < 0 || p.x > this.width || p.y < 0 || p.y > this.height) {
        ctrl.emitAnchor(id, null);
      } else {
        ctrl.emitAnchor(id, { x: p.x, y: p.y, scale });
      }
    }
  }

  /** One-shot anchor refresh when a consumer starts tracking a node (RL-4). */
  refreshAnchors(): void {
    this.emitAnchors();
  }

  // --- labels + rings (2D overlay) -----------------------------------------

  private drawLabels(): void {
    const ctx = this.labelCtx;
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    if (this.nodes.length === 0) return;

    const level = semanticLevel(this.camera.zoom);
    const ink = `#${inkColor().toString(16).padStart(6, "0")}`;
    const accent = `#${accentColor().toString(16).padStart(6, "0")}`;
    const highlight = `#${highlightColor().toString(16).padStart(6, "0")}`;
    const ppw = this.pixelsPerWorld();
    // Screen-px UI-scale: ring gaps, stroke widths, and label offsets track the DOM.
    const s = uiScale();

    // Emphasis rings (under labels). Three theme-token treatments kept visually
    // distinct so hover, selection, and pin never read the same:
    //   • SELECTED — the dominant ring: ACCENT hue, thickness scaled as a
    //     MULTIPLIER of the node radius (floored 3.5px, capped 10px) + a wide gap.
    //   • HOVERED  — a thinner ring in the distinct theme HIGHLIGHT hue, so a
    //     transient hover never reads as a selection.
    //   • PINNED   — a thin dashed ACCENT ring (layout-fixed marker).
    // Precedence selected > hovered > pinned: a selected node keeps its strong
    // ring while hovered.
    for (let i = 0; i < this.nodes.length; i++) {
      const id = this.nodes[i].id;
      const selected = this.selectedIds.has(id);
      const hovered = this.hoveredId === id;
      const pinned = this.pinnedIds.has(id);
      const pulsed = this.pulseIds.has(id);
      if (!selected && !hovered && !pinned && !pulsed) continue;
      const p = this.worldToScreen(i);
      if (!p) continue;
      const nodeR = Math.max(
        3 * s,
        nodeWorldRadius(this.nodes[i], this.appearance) * ppw,
      );
      // Base emphasis ring (precedence selected > hovered > pinned).
      if (selected || hovered || pinned) {
        ctx.beginPath();
        if (selected) {
          ctx.arc(p.x, p.y, nodeR + 5 * s, 0, Math.PI * 2);
          ctx.strokeStyle = accent;
          ctx.lineWidth = Math.min(10 * s, Math.max(3.5 * s, nodeR * 0.22));
        } else if (hovered) {
          ctx.arc(p.x, p.y, nodeR + 3 * s, 0, Math.PI * 2);
          ctx.strokeStyle = highlight;
          ctx.lineWidth = 1.75 * s;
        } else {
          ctx.arc(p.x, p.y, nodeR + 3 * s, 0, Math.PI * 2);
          ctx.strokeStyle = accent;
          ctx.lineWidth = 1.5 * s;
          ctx.setLineDash([3 * s, 3 * s]);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Transient pulse ring (additive flash in the highlight hue).
      if (pulsed) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, nodeR + 8 * s, 0, Math.PI * 2);
        ctx.strokeStyle = highlight;
        ctx.lineWidth = 2.5 * s;
        ctx.globalAlpha = 0.85;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Labels — typography from the CENTRALIZED design tokens (binding Figma
    // "graph/Label — Feature | Document"): feature = Label/12 · ink, document =
    // Meta/11 · ink-muted, plate-less. Sizes are rem-relative (resolved against the
    // root font size in labelStyle) so canvas labels scale with the DOM under one
    // UI scale — never a hardcoded px. DOI by semantic level, plus always-on for
    // hovered/selected/pinned (labelVisible).
    const featureFont = labelTextStyle("feature").font;
    const docFont = labelTextStyle("document").font;
    const inkMuted = `#${inkMutedColor().toString(16).padStart(6, "0")}`;
    ctx.textBaseline = "middle";
    let budget = 220; // clutter cap
    for (let i = 0; i < this.nodes.length && budget > 0; i++) {
      const node = this.nodes[i];
      if (!this.labelVisible(node, level)) continue;
      const p = this.worldToScreen(i);
      if (!p || p.x < -40 || p.x > this.width + 40 || p.y < 0 || p.y > this.height)
        continue;
      const r = Math.max(3 * s, nodeWorldRadius(node, this.appearance) * ppw);
      const text = node.title ?? node.id;
      const isFeature = node.kind === "feature";
      ctx.font = isFeature ? featureFont : docFont;
      ctx.fillStyle = isFeature ? ink : inkMuted;
      ctx.globalAlpha = isFeature ? 1 : 0.9;
      ctx.fillText(text, p.x + r + 4 * s, p.y);
      budget--;
    }
    ctx.globalAlpha = 1;
  }

  private labelVisible(node: SceneNodeData, level: string): boolean {
    if (this.selectedIds.has(node.id)) return true;
    if (this.hoveredId === node.id) return true;
    if (this.pinnedIds.has(node.id)) return true;
    if (this.visibleNodeIds && !this.visibleNodeIds.has(node.id)) return false;
    if (node.kind === "feature") return true; // features always anchor the field
    if (level === "document") return (node.salience ?? 0) >= 0.45;
    return false;
  }

  // --- camera --------------------------------------------------------------

  private pixelsPerWorld(): number {
    return (this.height / this.viewHeight) * this.camera.zoom;
  }

  private worldToScreen(i: number): { x: number; y: number } | null {
    const wx = this.cpuPositions[i * 4];
    const wy = this.cpuPositions[i * 4 + 1];
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) return null;
    const halfW = (this.camera.right - this.camera.left) / 2 / this.camera.zoom;
    const halfH = (this.camera.top - this.camera.bottom) / 2 / this.camera.zoom;
    const ndcX = (wx - this.camera.position.x) / halfW;
    const ndcY = (wy - this.camera.position.y) / halfH;
    return {
      x: (ndcX * 0.5 + 0.5) * this.width,
      y: (1 - (ndcY * 0.5 + 0.5)) * this.height,
    };
  }

  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const halfW = (this.camera.right - this.camera.left) / 2 / this.camera.zoom;
    const halfH = (this.camera.top - this.camera.bottom) / 2 / this.camera.zoom;
    const ndcX = (sx / this.width) * 2 - 1;
    const ndcY = (1 - sy / this.height) * 2 - 1;
    return {
      x: this.camera.position.x + ndcX * halfW,
      y: this.camera.position.y + ndcY * halfH,
    };
  }

  private fitToSeed(): void {
    this.frameBounds(
      -this.seedRadius,
      -this.seedRadius,
      this.seedRadius,
      this.seedRadius,
    );
  }

  /** Axis-aligned bounding box over all live node positions, or null when there are
   *  no finite positions yet. Shared by fitToView (cold framing) and the minimap. */
  private graphBounds(): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null {
    if (!this.solver) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < this.solver.count; i++) {
      const x = this.cpuPositions[i * 4];
      const y = this.cpuPositions[i * 4 + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return minX > maxX ? null : { minX, minY, maxX, maxY };
  }

  private fitToView(): void {
    const b = this.graphBounds();
    if (!b) return this.fitToSeed();
    this.frameBounds(b.minX, b.minY, b.maxX, b.maxY);
  }

  private frameBounds(minX: number, minY: number, maxX: number, maxY: number): void {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const aspect = this.width / this.height;
    const zoomX = (this.viewHeight * aspect) / (spanX * FIT_PADDING_FACTOR);
    const zoomY = this.viewHeight / (spanY * FIT_PADDING_FACTOR);
    this.camera.position.set(cx, cy, 10);
    this.camera.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(zoomX, zoomY)));
    this.camera.updateProjectionMatrix();
    this.emitCameraChange();
    this.requestRender();
  }

  private zoomBy(factor: number): void {
    this.camera.zoom = Math.max(
      ZOOM_MIN,
      Math.min(ZOOM_MAX, this.camera.zoom * factor),
    );
    this.camera.updateProjectionMatrix();
    this.emitCameraChange();
    this.requestRender();
  }

  /** Zoom keeping the world point under (sx, sy) screen px stationary. */
  private zoomAtScreen(factor: number, sx: number, sy: number): void {
    const before = this.screenToWorld(sx, sy);
    this.camera.zoom = Math.max(
      ZOOM_MIN,
      Math.min(ZOOM_MAX, this.camera.zoom * factor),
    );
    this.camera.updateProjectionMatrix();
    const after = this.screenToWorld(sx, sy);
    this.camera.position.x += before.x - after.x;
    this.camera.position.y += before.y - after.y;
    this.camera.updateProjectionMatrix();
    this.emitCameraChange();
    this.requestRender();
  }

  private focusNode(id: string): void {
    const i = this.idToIndex.get(id);
    if (i === undefined) return;
    const x = this.cpuPositions[i * 4];
    const y = this.cpuPositions[i * 4 + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.camera.position.set(x, y, 10);
    this.camera.updateProjectionMatrix();
    this.emitCameraChange();
    this.requestRender();
  }

  private emitCameraChange(): void {
    const level = semanticLevel(this.camera.zoom);
    this.controller?.emit({ kind: "camera-change", scale: this.camera.zoom, level });
  }

  // --- minimap -------------------------------------------------------------

  /** Register (or clear) the chrome-hosted minimap canvas. The field owns every
   *  pixel inside it; chrome never draws. Forwarded from
   *  SceneController.setMinimapCanvas via duck-typing. */
  setMinimapCanvas(canvas: HTMLCanvasElement | null): void {
    this.detachMinimap?.();
    this.detachMinimap = null;
    this.minimapCanvas = canvas;
    this.minimapCtx = canvas ? canvas.getContext("2d") : null;
    this.minimapView = null;
    if (canvas) {
      this.detachMinimap = this.attachMinimapInteraction(canvas);
      this.renderMinimap();
    }
  }

  /** Draw the downscaled overview (node dots) + the current-viewport rectangle into
   *  the minimap canvas. Called from renderFrame, so it tracks settle ticks, camera
   *  moves, and data changes with no separate loop (bounded). */
  private renderMinimap(): void {
    const canvas = this.minimapCanvas;
    const ctx = this.minimapCtx;
    if (!canvas || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const b = this.graphBounds();
    if (!b) {
      this.minimapView = null;
      return;
    }
    const spanX = Math.max(b.maxX - b.minX, 1);
    const spanY = Math.max(b.maxY - b.minY, 1);
    const scale = Math.min(
      (w * (1 - 2 * MINIMAP_INSET)) / spanX,
      (h * (1 - 2 * MINIMAP_INSET)) / spanY,
    );
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    this.minimapView = { scale, cx, cy };
    const toX = (wx: number): number => w / 2 + (wx - cx) * scale;
    const toY = (wy: number): number => h / 2 - (wy - cy) * scale; // world up = screen up

    // Node dots — a faint muted-ink constellation; bounded dot size.
    const count = this.solver?.count ?? 0;
    const dot = Math.max(1, Math.min(2.5, scale * 6));
    const r = dot / 2;
    ctx.fillStyle = hexCss(inkMutedColor());
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < count; i++) {
      const x = this.cpuPositions[i * 4];
      const y = this.cpuPositions[i * 4 + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      ctx.fillRect(toX(x) - r, toY(y) - r, dot, dot);
    }
    ctx.globalAlpha = 1;

    // Viewport rectangle — the current camera view in world → minimap. The only
    // stroked outline on the overview, so position reads in grayscale too.
    const halfW = (this.camera.right - this.camera.left) / 2 / this.camera.zoom;
    const halfH = (this.camera.top - this.camera.bottom) / 2 / this.camera.zoom;
    const left = toX(this.camera.position.x - halfW);
    const right = toX(this.camera.position.x + halfW);
    const top = toY(this.camera.position.y + halfH);
    const bottom = toY(this.camera.position.y - halfH);
    ctx.strokeStyle = hexCss(accentColor());
    ctx.lineWidth = 1;
    ctx.strokeRect(
      Math.round(left) + 0.5,
      Math.round(top) + 0.5,
      Math.max(1, Math.round(right - left)),
      Math.max(1, Math.round(bottom - top)),
    );
  }

  /** Pointer click/drag on the minimap pans the main camera to the picked world
   *  point. Returns a cleanup that removes the listeners. */
  private attachMinimapInteraction(canvas: HTMLCanvasElement): () => void {
    const toWorld = (ev: PointerEvent): { x: number; y: number } | null => {
      const view = this.minimapView;
      if (!view) return null;
      const rect = canvas.getBoundingClientRect();
      // CSS px → backing-store px (canvas.width may differ from its CSS size).
      const sx = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width;
      const sy = ((ev.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height;
      return {
        x: view.cx + (sx - canvas.width / 2) / view.scale,
        y: view.cy - (sy - canvas.height / 2) / view.scale,
      };
    };
    const panTo = (ev: PointerEvent): void => {
      const world = toWorld(ev);
      if (!world) return;
      this.camera.position.set(world.x, world.y, 10);
      this.camera.updateProjectionMatrix();
      this.emitCameraChange();
      this.requestRender();
    };
    const onDown = (ev: PointerEvent): void => {
      this.minimapDragging = true;
      canvas.setPointerCapture(ev.pointerId);
      panTo(ev);
    };
    const onMove = (ev: PointerEvent): void => {
      if (this.minimapDragging) panTo(ev);
    };
    const onUp = (ev: PointerEvent): void => {
      this.minimapDragging = false;
      if (canvas.hasPointerCapture(ev.pointerId))
        canvas.releasePointerCapture(ev.pointerId);
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.style.cursor = "pointer";
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }

  // --- picking + interaction ----------------------------------------------

  private setHovered(id: string | null): void {
    if (id === this.hoveredId) return;
    this.hoveredId = id;
    this.applyEmphasis();
    this.controller?.emit({ kind: "hover", id });
    this.requestRender();
  }

  private pickNodeAtScreen(sx: number, sy: number): string | null {
    // cpuPositions is the live source of truth (pack() runs every tick), so the
    // hit test is always current — no GPU readback.
    const ppw = this.pixelsPerWorld();
    let best: string | null = null;
    let bestDistSq = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      if (this.visibleNodeIds && !this.visibleNodeIds.has(this.nodes[i].id)) continue;
      const p = this.worldToScreen(i);
      if (!p) continue;
      const radius = Math.max(
        PICK_RADIUS_PX * uiScale(),
        nodeWorldRadius(this.nodes[i], this.appearance) * ppw,
      );
      const dx = p.x - sx;
      const dy = p.y - sy;
      const distSq = dx * dx + dy * dy;
      if (distSq <= radius * radius && distSq < bestDistSq) {
        bestDistSq = distSq;
        best = this.nodes[i].id;
      }
    }
    return best;
  }

  private eventToScreen(ev: MouseEvent): [number, number] {
    const rect = this.renderer?.domElement.getBoundingClientRect();
    return [ev.clientX - (rect?.left ?? 0), ev.clientY - (rect?.top ?? 0)];
  }

  private startNodeDrag(index: number, sx: number, sy: number): void {
    if (!this.solver) return;
    this.dragNodeIndex = index;
    this.dragActive = true;
    // No global re-energise: the solver pins the grabbed node and wakes only its
    // link-neighbours within wakeRadius (the sleep/active-set model); every other
    // settled node stays pinned, so distant clusters do not move.
    this.running = true;
    const w = this.screenToWorld(sx, sy);
    this.solver.setDrag(index, w.x, w.y);
    this.wake();
  }

  private endNodeDrag(): void {
    if (this.dragNodeIndex < 0) return;
    this.solver?.clearDrag();
    this.dragNodeIndex = -1;
    this.dragActive = false;
    // Keep ticking; the released neighbourhood re-settles via the solver, then sleeps.
    this.running = true;
    this.wake();
  }

  private setCursor(c: string): void {
    if (this.renderer) this.renderer.domElement.style.cursor = c;
  }

  private attachInteraction(el: HTMLElement): void {
    el.addEventListener(
      "wheel",
      (ev: WheelEvent) => {
        ev.preventDefault();
        const [sx, sy] = this.eventToScreen(ev);
        this.zoomAtScreen(
          ev.deltaY < 0 ? ZOOM_STEP_WHEEL : 1 / ZOOM_STEP_WHEEL,
          sx,
          sy,
        );
      },
      { passive: false },
    );
    el.addEventListener("pointerdown", (ev: PointerEvent) => {
      this.dragMoved = false;
      this.lastX = ev.clientX;
      this.lastY = ev.clientY;
      el.setPointerCapture(ev.pointerId);
      const [sx, sy] = this.eventToScreen(ev);
      const id = ev.button === 0 ? this.pickNodeAtScreen(sx, sy) : null;
      const i = id ? this.idToIndex.get(id) : undefined;
      if (i !== undefined) {
        // Grab a node — direct manipulation; the camera does not pan.
        this.startNodeDrag(i, sx, sy);
        this.setCursor("grabbing");
      } else {
        this.dragging = true; // camera pan on empty canvas
        this.setCursor("grabbing");
      }
    });
    el.addEventListener("pointermove", (ev: PointerEvent) => {
      const [sx, sy] = this.eventToScreen(ev);
      if (this.dragNodeIndex >= 0) {
        this.dragMoved = true;
        const w = this.screenToWorld(sx, sy);
        this.solver?.setDrag(this.dragNodeIndex, w.x, w.y);
        this.wake();
        return;
      }
      if (this.dragging) {
        const dx = ev.clientX - this.lastX;
        const dy = ev.clientY - this.lastY;
        if (Math.abs(dx) + Math.abs(dy) > 2) this.dragMoved = true;
        this.lastX = ev.clientX;
        this.lastY = ev.clientY;
        const ppw = this.pixelsPerWorld();
        this.camera.position.x -= dx / ppw;
        this.camera.position.y += dy / ppw;
        this.camera.updateProjectionMatrix();
        this.requestRender();
        return;
      }
      const hit = this.pickNodeAtScreen(sx, sy);
      this.setHovered(hit);
      this.setCursor(hit ? "grab" : "default");
    });
    const end = (ev: PointerEvent) => {
      this.dragging = false;
      if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
    };
    el.addEventListener("pointerup", (ev: PointerEvent) => {
      const draggedNode = this.dragNodeIndex >= 0;
      const wasDrag = this.dragMoved;
      this.endNodeDrag();
      end(ev);
      this.setCursor("default");
      if (ev.button !== 0) return;
      // A click (no movement) selects; a node drag also selects the grabbed node.
      if (!wasDrag || draggedNode) {
        const [sx, sy] = this.eventToScreen(ev);
        this.controller?.emit({ kind: "select", id: this.pickNodeAtScreen(sx, sy) });
      }
    });
    el.addEventListener("pointercancel", (ev: PointerEvent) => {
      this.endNodeDrag();
      end(ev);
    });
    el.addEventListener("dblclick", (ev: MouseEvent) => {
      const [sx, sy] = this.eventToScreen(ev);
      const id = this.pickNodeAtScreen(sx, sy);
      if (id) this.controller?.emit({ kind: "open", id });
    });
    el.addEventListener("contextmenu", (ev: MouseEvent) => {
      ev.preventDefault();
      const [sx, sy] = this.eventToScreen(ev);
      const id = this.pickNodeAtScreen(sx, sy);
      this.controller?.emit({
        kind: "context-menu",
        id,
        target: "node",
        clientX: ev.clientX,
        clientY: ev.clientY,
      });
    });
    el.addEventListener("pointerleave", () => {
      if (this.dragNodeIndex < 0) this.setHovered(null);
    });
  }
}
