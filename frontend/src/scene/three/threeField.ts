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
import { buildGlyphAtlas, glyphKeyForNode, type GlyphAtlas } from "./glyphAtlas";

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
// Label LOD + ring treatment (read from the registry; one definition each).
const LABEL_BUDGET = controlNumber("labelBudget");
const DOC_LABEL_SALIENCE_FLOOR = controlNumber("documentLabelSalienceFloor");
const PULSE_RING_WIDTH = controlNumber("pulseRingWidth");
const PULSE_RING_ALPHA = controlNumber("pulseRingAlpha");
// Hover/selection emphasis — SUBTLE + theme-palette only (user goal): keep the
// hover↔non-hover difference SMALL, every colour from the established Figma palette, no
// black, no adhoc hex, gradient blends kept. De-emphasis is COLOUR-ONLY at full opacity: a
// non-focus node mixes GENTLY toward the canvas background (node material uDimColor =
// canvasBackground) so it recedes a touch without leaving its hue family; focus nodes keep
// full category colour. Edges keep their category GRADIENT in every mode (no recolour); the
// only emphasis is this gentle node recede + a thin accent focus ring. No glow, no near-black.
const NODE_RECEDE_MIX = 0.3; // gentle non-focus mix toward the canvas bg (subtle de-emphasis)
const FOCUS_RING_WIDTH_PX = 2; // thin accent focus ring on the hovered hub
// Icon mode (graph-node-icons): the circle ↔ doc-type-icon cross-fade by on-screen
// node size. Below LO the node is a plain dot (an icon would be sub-legible — the marks
// are gated at 14px); above HI it is the full icon; between, the two cross-fade. The
// icon quad is drawn a touch larger than the dot it replaces so the silhouette reads.
// Local render constants (mirroring NODE_RECEDE_MIX / FOCUS_RING_WIDTH_PX above), not
// schema knobs — they are fixed legibility thresholds, not user-tunable look params.
const ICON_SIZE_MULT = 1.7; // icon half-extent vs node radius
const ICON_FADE_LO_PX = 5; // node radius (screen px) where the icon begins to appear
const ICON_FADE_HI_PX = 11; // ...and is fully shown (the dot has fully faded)
// Bounded GL-context-restore retries (bounded-by-default): after this many failed rebuilds
// on webglcontextrestored, the scene reports render-unavailable (recoverable:false).
const MAX_GL_RESTORE_ATTEMPTS = 3;
// Defense-in-depth node ceiling for set-data (Rule 2: every CLIENT wire-ingestion point
// bounds + reports, never trusting the upstream cap). Mirrors the stores adapter's
// MAX_CLIENT_GRAPH_NODES (20000) — set well above any real graph; the scene clamps its OWN
// boundary so an oversized/regressed/direct payload can't exhaust GPU memory.
const MAX_SCENE_NODES = 20000;
// FPS-adaptive LOD hysteresis band (perf hardening): degrade above a ~25fps-equivalent
// per-frame render cost, restore below ~45fps — the gap prevents flapping between tiers.
const PERF_DEGRADE_MS = 40;
const PERF_RESTORE_MS = 22;

/** 0xRRGGBB int → a CSS "#rrggbb" string for canvas-2D (minimap) fills/strokes. */
function hexCss(n: number): string {
  return "#" + (n & 0xffffff).toString(16).padStart(6, "0");
}

/** Format a number as a GLSL float literal so an integer default (e.g. 240) compiles
 *  as `240.0`, not the bare int `240` that GLSL rejects where a float is required. */
function glslFloat(n: number): string {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
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
// Icon mode: when on, the circle FADES OUT as the node grows so its doc-type icon (the
// sibling glyph mesh) fades IN — dots far out, icons close in. uIconMode 0 ≡ circles only.
uniform float uIconMode;
varying float vIconFade;
const float NODE_MIN_PX = ${glslFloat(controlNumber("nodeMinPx"))}; // floor on screen — visible zoomed out (schema nodeMinPx)
const float NODE_MAX_PX = ${glslFloat(controlNumber("nodeMaxPx"))}; // ceiling on screen — no balloon zoomed in (schema nodeMaxPx)
const float ICON_FADE_LO = ${glslFloat(ICON_FADE_LO_PX)};
const float ICON_FADE_HI = ${glslFloat(ICON_FADE_HI_PX)};

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
  vIconFade =
    uIconMode * smoothstep(ICON_FADE_LO * uPxScale, ICON_FADE_HI * uPxScale, pxC);
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
varying float vIconFade;

void main() {
  float alpha = 1.0 - smoothstep(1.0 - vAA, 1.0, vEdge);
  // Cross-fade: the circle recedes as its icon takes over (icon mode only; vIconFade 0 otherwise).
  alpha *= (1.0 - vIconFade);
  if (alpha <= 0.0) discard;
  // Emphasis is COLOUR-ONLY at full opacity (never an opacity fade). A focus node keeps its
  // full category colour; a non-focus node (vDim > 0.5) mixes GENTLY toward uDimColor (the
  // canvas background) so it recedes a touch — a small, subtle difference, no flat greyout.
  vec3 col = vDim > 0.5 ? mix(vColor, uDimColor, ${glslFloat(NODE_RECEDE_MIX)}) : vColor;
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
const float EDGE_MIN_PX = ${glslFloat(controlNumber("edgeMinPx"))}; // floor — won't vanish (schema edgeMinPx)
const float EDGE_MAX_PX = ${glslFloat(controlNumber("edgeMaxPx"))}; // ceiling — no balloon (schema edgeMaxPx)

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
  // Edges ALWAYS render at full opacity + full colour on hover — the structure stays
  // legible; de-emphasis is node-colour-only, never an edge fade (user hover redesign).
  // (vAlpha still carries the per-edge confidence opacity + the filter visibility mask —
  // a FILTERED-OUT edge is still hidden; only the HOVER emphasis no longer touches edges.)
  gl_FragColor = vec4(vColor, vAlpha);
}
`;

// Glyph layer (graph-node-icons): a quad per node textured from the doc-type mark
// atlas, sampling the SAME position texture + on-screen px clamp as the node circle so
// the icon sits exactly where the dot was. Tinted by the node's category hue (the atlas
// is a white-ink coverage map — the white-ink-then-tint contract). The quad's UVs map
// its TOP vertex to v=0 so the upright (top-down) atlas renders upright.
const GLYPH_VERTEX = /* glsl */ `
attribute float aIndex;
attribute float aSize;
attribute vec3 aColor;
attribute float aDim;
attribute float aHidden;
attribute float aCell;
attribute vec2 aUv;
uniform sampler2D uPositions;
uniform float uTexSize;
uniform float uPixelsPerWorld;
uniform float uPxScale;
uniform float uAtlasCols;
uniform float uAtlasRows;
varying vec2 vUv;
varying vec3 vColor;
varying float vDim;
varying float vFade;
const float NODE_MIN_PX = ${glslFloat(controlNumber("nodeMinPx"))};
const float NODE_MAX_PX = ${glslFloat(controlNumber("nodeMaxPx"))};
const float ICON_MULT = ${glslFloat(ICON_SIZE_MULT)};
const float ICON_FADE_LO = ${glslFloat(ICON_FADE_LO_PX)};
const float ICON_FADE_HI = ${glslFloat(ICON_FADE_HI_PX)};

void main() {
  vec2 puv = (vec2(mod(aIndex, uTexSize), floor(aIndex / uTexSize)) + 0.5) / uTexSize;
  vec2 center = texture2D(uPositions, puv).xy;
  float ppw = uPixelsPerWorld;
  float pxC = clamp(aSize * ppw, NODE_MIN_PX * uPxScale, NODE_MAX_PX * uPxScale);
  float radiusWorld = ppw > 0.0 ? pxC / ppw : aSize;
  float scale = (aHidden > 0.5 || aCell < 0.0) ? 0.0 : radiusWorld * ICON_MULT;
  vec2 world = center + position.xy * scale;
  float col = mod(aCell, uAtlasCols);
  float row = floor(aCell / uAtlasCols);
  vUv = vec2((col + aUv.x) / uAtlasCols, (row + aUv.y) / uAtlasRows);
  vColor = aColor;
  vDim = aDim;
  vFade = smoothstep(ICON_FADE_LO * uPxScale, ICON_FADE_HI * uPxScale, pxC);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 0.0, 1.0);
}
`;

const GLYPH_FRAGMENT = /* glsl */ `
precision mediump float;
uniform sampler2D uAtlas;
uniform vec3 uDimColor;
varying vec2 vUv;
varying vec3 vColor;
varying float vDim;
varying float vFade;

void main() {
  float cov = texture2D(uAtlas, vUv).r;
  float a = cov * vFade;
  if (a <= 0.01) discard;
  // Same gentle de-emphasis recede as the circle, so a de-emphasised icon matches.
  vec3 col = vDim > 0.5 ? mix(vColor, uDimColor, ${glslFloat(NODE_RECEDE_MIX)}) : vColor;
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
  // Icon mode (graph-node-icons): a sibling glyph mesh + the shared doc-type-mark atlas.
  // The atlas is built lazily on first icon enable and cached across data swaps; the mesh
  // is rebuilt with each set-data alongside the node mesh. Null when icons have never been
  // turned on (or the host cannot build the texture).
  private glyphMesh: Mesh | null = null;
  private glyphMaterial: ShaderMaterial | null = null;
  private glyphAtlas: GlyphAtlas | null = null;
  private glyphAtlasFailed = false;
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
  // GL-context-restore attempt counter (bounded retry on webglcontextrestored).
  private glRestoreAttempts = 0;
  // FPS-adaptive LOD (perf hardening): EMA of render cost + a hysteresis-gated degraded flag.
  private frameMsEma = 0;
  private perfDegraded = false;

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

    // Capability detection, TWO-TIER (user mandate: "software-WebGL fallback — must run in
    // headless Chrome w/o GPU"). Tier 1 prefers a real GPU (powerPreference high-performance
    // + failIfMajorPerformanceCaveat) so a capable machine never silently drops to a crawl.
    // Tier 2: if that throws (headless / SwiftShader / software-only / weak iGPU), RETRY
    // without the caveat so the graph still RENDERS via software-WebGL (degraded frame rate is
    // the perf-adaptive LOD axis's concern, not a blank canvas). Only when NO GL context can be
    // created at all do we report `unavailable` — app-chrome renders the gpu-unavailable
    // CanvasState (the scene never draws its own DOM fallback; layer boundary).
    let renderer: WebGLRenderer;
    let softwareFallback = false;
    try {
      renderer = new WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: true,
      });
    } catch {
      try {
        // Tier 2: software-WebGL fallback (drop failIfMajorPerformanceCaveat) — the graph
        // still RENDERS (the user's headless/no-GPU mandate). `reason:"software-fallback"`
        // on the ok emit flags software mode so the perf-adaptive LOD axis (#5) can throttle;
        // this is `ok` (rendering), NOT a degraded state.
        renderer = new WebGLRenderer({
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        });
        softwareFallback = true;
      } catch (err) {
        this.controller?.emit({
          kind: "render-capability",
          state: "unavailable",
          recoverable: false,
          reason: err instanceof Error ? err.message : "WebGL context unavailable",
        });
        return;
      }
    }
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
    // WebGL context-loss resilience: preventDefault on loss is REQUIRED for the browser to
    // fire a restore; on restore we rebuild GL resources from the persisted CPU layout.
    renderer.domElement.addEventListener("webglcontextlost", this.onContextLost, false);
    renderer.domElement.addEventListener(
      "webglcontextrestored",
      this.onContextRestored,
      false,
    );

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
    // GL context created — report render-capable. A tier-2 software context still renders
    // (the headless/no-GPU mandate); reason:"software-fallback" flags software mode for the
    // perf-adaptive LOD axis. Both tiers are `ok`, never a degraded state.
    this.controller?.emit({
      kind: "render-capability",
      state: "ok",
      recoverable: true,
      ...(softwareFallback ? { reason: "software-fallback" } : {}),
    });
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
    this.glyphAtlas?.texture.dispose();
    this.glyphAtlas = null;
    this.detachMinimap?.();
    this.detachMinimap = null;
    this.minimapCanvas = null;
    this.minimapCtx = null;
    this.labelCanvas?.remove();
    this.labelCanvas = null;
    this.labelCtx = null;
    if (this.renderer) {
      this.renderer.domElement.removeEventListener(
        "webglcontextlost",
        this.onContextLost,
      );
      this.renderer.domElement.removeEventListener(
        "webglcontextrestored",
        this.onContextRestored,
      );
      this.renderer.domElement.remove();
      this.renderer.dispose();
      this.renderer = null;
    }
    const g = window as unknown as { __threeField?: ThreeField };
    if (g.__threeField === this) delete g.__threeField;
  }

  // --- WebGL context-loss resilience (scene-WebGL hardening) ----------------

  /** WebGL context lost (GPU crash / driver reset / tab backgrounding): preventDefault is
   *  REQUIRED or the browser never fires a restore. Pause the loop + report; the CPU
   *  d3-force layout (cpuPositions/solver) is untouched and persists for the rebuild. */
  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.scheduled = false;
    this.controller?.emit({
      kind: "render-capability",
      state: "context-lost",
      recoverable: true,
    });
  };

  /** WebGL context restored: rebuild the GL resources from the persisted CPU layout and
   *  resume. Bounded retry — after MAX_GL_RESTORE_ATTEMPTS failures, report unavailable. */
  private onContextRestored = (): void => {
    try {
      this.rebuildGLResources();
      this.glRestoreAttempts = 0;
      this.controller?.emit({
        kind: "render-capability",
        state: "ok",
        recoverable: true,
      });
      this.running = true;
      this.requestRender();
    } catch (err) {
      this.glRestoreAttempts += 1;
      this.controller?.emit(
        this.glRestoreAttempts >= MAX_GL_RESTORE_ATTEMPTS
          ? {
              kind: "render-capability",
              state: "unavailable",
              recoverable: false,
              reason: err instanceof Error ? err.message : "GL restore failed",
            }
          : { kind: "render-capability", state: "context-lost", recoverable: true },
      );
    }
  };

  /** Recreate the GPU-side resources after a context restore, from the persisted CPU state
   *  (nodes / edges / idToIndex / cpuPositions / solver) — the layout never re-explodes,
   *  only the GL handles rebuild. The 2D label canvas is unaffected by GL context loss. */
  private rebuildGLResources(): void {
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
    // The glyph atlas is a GPU texture too — its handle is dead after a context loss, so
    // drop it (and the mesh) and let buildNodes rebuild both from the cached marks.
    this.disposeGlyphs();
    this.glyphAtlas?.texture.dispose();
    this.glyphAtlas = null;
    this.glyphAtlasFailed = false;
    if (this.nodes.length === 0 || !this.solver) return;
    const texSize = this.solver.texSize;
    this.positionTex = new DataTexture(
      this.cpuPositions,
      texSize,
      texSize,
      RGBAFormat,
      FloatType,
    );
    this.positionTex.minFilter = NearestFilter;
    this.positionTex.magFilter = NearestFilter;
    this.positionTex.needsUpdate = true;
    this.buildNodes(this.nodes, texSize);
    this.buildEdges(this.edgeData, this.idToIndex, texSize);
    this.applyEmphasis();
    this.applyEdgeAlpha();
  }

  command(cmd: SceneCommand): void {
    switch (cmd.kind) {
      case "set-data":
        this.setData(cmd.nodes, cmd.edges, cmd.reflow ?? false);
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

  private setData(
    nodes: SceneNodeData[],
    edges: SceneEdgeData[],
    reflow = false,
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
    // A FILTER-driven reflow (set-data carrying `reflow`) warm-starts whenever ANY node
    // carries over: a removal drops the filtered-out nodes and the carried survivors
    // re-form in place; a re-add seeds the returning nodes by their carried neighbours.
    // It deliberately bypasses the >=half cold gate (a filter that hides most nodes must
    // NOT re-explode + refit) and preserves the user's camera. A pure data update keeps
    // the >=half object-constancy gate.
    const warm = reflow
      ? nodes.length > 0 && carried > 0
      : nodes.length > 0 && carried >= 0.5 * nodes.length;
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

    // The node de-emphasis recede target is the canvas BACKGROUND (an established palette
    // token, theme-adaptive): a non-focus node mixes gently toward it (NODE_RECEDE_MIX) so it
    // recedes into the paper a touch, at full alpha. No adhoc colour.
    const dim = new Color(canvasBackground());
    this.nodeMaterial = new ShaderMaterial({
      uniforms: {
        uPositions: { value: null as Texture | null },
        uTexSize: { value: texSize },
        uPixelsPerWorld: { value: this.pixelsPerWorld() },
        uDimColor: { value: [dim.r, dim.g, dim.b] },
        uPxScale: { value: uiScale() },
        uIconMode: { value: this.appearance.nodeIcons ? 1 : 0 },
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

    // Build the icon layer when icon mode is active (lazy: the atlas is built on first
    // enable and cached). Re-syncs aColor/aSize from the node attrs just computed.
    if (this.appearance.nodeIcons) this.buildGlyphs(nodes, texSize, aColor, aSize);
  }

  /**
   * Build the per-node glyph (icon) instanced mesh — the sibling of buildNodes. Reuses
   * the node attrs (same index/size/colour) and adds the atlas cell per node. The atlas
   * is built once and cached; if it cannot be built (no texture support) the icon layer
   * is skipped and the circles render unchanged. Disposed in disposeGraph; rebuilt on a
   * data swap or an icon-mode enable.
   */
  private buildGlyphs(
    nodes: SceneNodeData[],
    texSize: number,
    aColor: Float32Array,
    aSize: Float32Array,
  ): void {
    if (!this.renderer || nodes.length === 0) return;
    if (!this.glyphAtlas) {
      if (this.glyphAtlasFailed) return;
      this.glyphAtlas = buildGlyphAtlas();
      if (!this.glyphAtlas) {
        this.glyphAtlasFailed = true;
        return;
      }
    }
    const atlas = this.glyphAtlas;
    const n = nodes.length;
    const aIndex = new Float32Array(n);
    const aDim = new Float32Array(n);
    const aHidden = new Float32Array(n);
    const aCell = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      aIndex[i] = i;
      aCell[i] = atlas.cellOf(glyphKeyForNode(nodes[i]));
    }

    // Unit quad (-1..1), UVs map the TOP vertex to v=0 so the top-down atlas is upright.
    const quadPos = new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]);
    const quadUv = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);
    const quadIdx = new Uint32Array([0, 1, 2, 2, 1, 3]);
    const geom = new InstancedBufferGeometry();
    geom.setAttribute("position", new Float32BufferAttribute(quadPos, 3));
    geom.setAttribute("aUv", new Float32BufferAttribute(quadUv, 2));
    geom.setIndex(new Uint32BufferAttribute(quadIdx, 1));
    geom.setAttribute("aIndex", new InstancedBufferAttribute(aIndex, 1));
    geom.setAttribute("aSize", new InstancedBufferAttribute(aSize.slice(), 1));
    geom.setAttribute("aColor", new InstancedBufferAttribute(aColor.slice(), 3));
    geom.setAttribute("aDim", new InstancedBufferAttribute(aDim, 1));
    geom.setAttribute("aHidden", new InstancedBufferAttribute(aHidden, 1));
    geom.setAttribute("aCell", new InstancedBufferAttribute(aCell, 1));
    geom.instanceCount = n;

    const dim = new Color(canvasBackground());
    this.glyphMaterial = new ShaderMaterial({
      uniforms: {
        uPositions: { value: null as Texture | null },
        uTexSize: { value: texSize },
        uPixelsPerWorld: { value: this.pixelsPerWorld() },
        uPxScale: { value: uiScale() },
        uAtlas: { value: atlas.texture },
        uAtlasCols: { value: atlas.cols },
        uAtlasRows: { value: atlas.rows },
        uDimColor: { value: [dim.r, dim.g, dim.b] },
      },
      vertexShader: GLYPH_VERTEX,
      fragmentShader: GLYPH_FRAGMENT,
      transparent: true,
      depthTest: false,
    });
    this.glyphMesh = new Mesh(geom, this.glyphMaterial);
    this.glyphMesh.frustumCulled = false;
    this.glyphMesh.renderOrder = 2; // above edges (0) and node circles (1)
    this.glyphMesh.visible = this.appearance.nodeIcons;
    this.scene.add(this.glyphMesh);
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
    this.disposeGlyphs();
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

  /** Tear down the glyph mesh + material (the cached atlas texture survives, reused on
   *  the next build; it is only disposed on destroy or a GL context loss). */
  private disposeGlyphs(): void {
    if (this.glyphMesh) {
      this.scene.remove(this.glyphMesh);
      this.glyphMesh.geometry.dispose();
      this.glyphMesh = null;
    }
    this.glyphMaterial?.dispose();
    this.glyphMaterial = null;
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
    if (!this.nodeMesh) return;
    const active = this.emphasisSet();
    // NODES — binary colour-recede (graph/Hover parity): 0 = full category colour (a focus
    // node OR no emphasis), 1 = de-emphasised (recede toward the warm ground, FULL alpha).
    // A focus node keeps full saturation; the hovered hub's pop is the ring + glow.
    const nodeDim = this.nodeMesh.geometry.getAttribute("aDim");
    const glyphDim = this.glyphMesh?.geometry.getAttribute("aDim");
    for (let i = 0; i < this.nodes.length; i++) {
      const dimmed = active && !active.has(this.nodes[i].id) ? 1 : 0;
      nodeDim.setX(i, dimmed);
      glyphDim?.setX(i, dimmed); // the icon recedes with its circle
    }
    nodeDim.needsUpdate = true;
    if (glyphDim) glyphDim.needsUpdate = true;

    // EDGES keep their category GRADIENT colour + confidence width in EVERY mode (built once
    // in buildEdges, never recoloured on hover/selection) — user goal: theme palette only,
    // gradients kept, no near-black recolour. Emphasis touches nodes only (above); edge alpha
    // depends solely on confidence + the filter visibility mask (applyEdgeAlpha).
  }

  private applyVisibility(
    nodeIds: ReadonlySet<string>,
    edgeIds: ReadonlySet<string>,
  ): void {
    if (!this.nodeMesh || !this.edgeMesh) return;
    const hidden = this.nodeMesh.geometry.getAttribute("aHidden");
    const glyphHidden = this.glyphMesh?.geometry.getAttribute("aHidden");
    for (let i = 0; i < this.nodes.length; i++) {
      const h = nodeIds.has(this.nodes[i].id) ? 0 : 1;
      hidden.setX(i, h);
      glyphHidden?.setX(i, h); // a filtered-out node hides its icon too
    }
    hidden.needsUpdate = true;
    if (glyphHidden) glyphHidden.needsUpdate = true;
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
    // Edges show their confidence-derived base opacity in every mode (gated by the filter
    // visibility mask) — no hover alpha boost, so the hover↔non-hover difference stays subtle.
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
    const iconsChanged = this.appearance.nodeIcons !== prev.nodeIcons;

    if (sizeChanged && this.nodeMesh) {
      const aSize = this.nodeMesh.geometry.getAttribute("aSize");
      const glyphSize = this.glyphMesh?.geometry.getAttribute("aSize");
      for (let i = 0; i < this.nodes.length; i++) {
        const r = nodeWorldRadius(this.nodes[i], this.appearance);
        aSize.setX(i, r);
        glyphSize?.setX(i, r); // the icon tracks the dot's size
      }
      aSize.needsUpdate = true;
      if (glyphSize) glyphSize.needsUpdate = true;
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

    if (iconsChanged) {
      const on = this.appearance.nodeIcons;
      if (this.nodeMaterial) this.nodeMaterial.uniforms.uIconMode.value = on ? 1 : 0;
      // Build the icon layer on first enable; thereafter just toggle its visibility.
      if (on && !this.glyphMesh && this.solver && this.nodeMesh) {
        const aColor = this.nodeMesh.geometry.getAttribute("aColor")
          .array as Float32Array;
        const aSize = this.nodeMesh.geometry.getAttribute("aSize")
          .array as Float32Array;
        this.buildGlyphs(this.nodes, this.solver.texSize, aColor, aSize);
        // Reflect the current emphasis/visibility onto the freshly-built glyph attrs.
        this.applyEmphasis();
        if (this.visibleNodeIds) {
          this.applyVisibility(this.visibleNodeIds, new Set<string>());
        }
      }
      if (this.glyphMesh) this.glyphMesh.visible = on;
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

    if (dirty) {
      const t0 = performance.now();
      this.renderFrame();
      this.updatePerfLod(performance.now() - t0);
    }
    if (this.running || this.needsRender) this.wake();
  };

  /**
   * FPS-adaptive LOD (perf hardening #5). Tracks an EMA of render cost and, with hysteresis
   * so it can't flap, degrades quality when frames get slow — covering the two-tier software
   * fallback (a fill-bound software-WebGL context on a large graph). Two clean levers: halve
   * the device-pixel-ratio (~4x fewer fragments — the biggest lever for fill-bound rendering,
   * no flicker, no filter conflict) and quarter the label budget (the per-frame 2D-overlay
   * cost, see drawLabels). Heavier tiers (salience-ordered node-draw cap, instancing
   * reduction) are a follow-on if these prove insufficient.
   */
  private updatePerfLod(frameMs: number): void {
    this.frameMsEma =
      this.frameMsEma === 0 ? frameMs : this.frameMsEma * 0.8 + frameMs * 0.2;
    const wasDegraded = this.perfDegraded;
    if (!this.perfDegraded && this.frameMsEma > PERF_DEGRADE_MS)
      this.perfDegraded = true;
    else if (this.perfDegraded && this.frameMsEma < PERF_RESTORE_MS)
      this.perfDegraded = false;
    if (this.perfDegraded !== wasDegraded && this.renderer) {
      this.renderer.setPixelRatio(this.perfDegraded ? Math.min(1, this.dpr) : this.dpr);
      this.needsRender = true;
    }
  }

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
    if (this.glyphMaterial && this.glyphMesh?.visible) {
      this.glyphMaterial.uniforms.uPositions.value = tex;
      this.glyphMaterial.uniforms.uPixelsPerWorld.value = ppw;
      this.glyphMaterial.uniforms.uPxScale.value = pxScale;
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
    // The active emphasis set (hover/selection) drives the focus/context split for the
    // glow + label colours below — recomputed once per draw.
    const focus = this.emphasisSet();

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
      // Base emphasis ring (precedence selected > hovered > pinned). The hovered hub's
      // focus ring is the binding 2px ACCENT (graph/Hover); selected stays the dominant
      // (wider) accent ring, pinned a thin dashed accent marker.
      if (selected || hovered || pinned) {
        ctx.beginPath();
        if (selected) {
          ctx.arc(p.x, p.y, nodeR + 5 * s, 0, Math.PI * 2);
          ctx.strokeStyle = accent;
          ctx.lineWidth = Math.min(10 * s, Math.max(3.5 * s, nodeR * 0.22));
        } else if (hovered) {
          ctx.arc(p.x, p.y, nodeR + 4 * s, 0, Math.PI * 2);
          ctx.strokeStyle = accent;
          ctx.lineWidth = FOCUS_RING_WIDTH_PX * s;
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
        ctx.lineWidth = PULSE_RING_WIDTH * s;
        ctx.globalAlpha = PULSE_RING_ALPHA;
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
    // FPS-adaptive LOD: quarter the label clutter cap when frames are slow (updatePerfLod).
    let budget = this.perfDegraded
      ? Math.max(24, Math.floor(LABEL_BUDGET / 4))
      : LABEL_BUDGET; // clutter cap
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
      // Label colour by focus membership while an emphasis is active (graph/Hover parity):
      // focus labels read in ink, context labels in the muted taupe. Off-emphasis, the
      // default feature=ink / document=ink-muted ramp applies.
      if (focus) {
        ctx.fillStyle = focus.has(node.id) ? ink : inkMuted;
      } else {
        ctx.fillStyle = isFeature ? ink : inkMuted;
      }
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
    if (level === "document") return (node.salience ?? 0) >= DOC_LABEL_SALIENCE_FLOOR;
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
