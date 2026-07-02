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
  foldSceneDeltas,
  type SceneCommand,
  type SceneDelta,
  type SceneEdgeData,
  type SceneFieldRenderer,
  type SceneNodeData,
  type SceneController,
} from "../sceneController";
import { semanticLevel } from "../field/cameraCore";
import { controlNumber, specById } from "./graphControlSchema";
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
  sceneRuleColor,
} from "./appearance";
import { D3_FORCE_DEFAULTS, D3ForceSolver, type D3ForceParams } from "./d3ForceSolver";
import { classifySwap } from "./swapClassifier";
import { labelTextStyle } from "./labelStyle";
import { rootFontPx, uiScale } from "./uiScale";
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
/** Live-retune kick: the gentle re-energise for a force/size slider — re-settle in
 *  place, never the old violent global 0.5 re-explode. */
const GENTLE_REHEAT_ALPHA = controlNumber("gentleReheatAlpha");
/** Cold-start alpha + prewarm caps, schema-read here for the set-data energy
 *  dispatch (proportional warm ramp toward cold; frozen swaps prep zero ticks). */
const COLD_START_ALPHA = controlNumber("coldAlpha");
const PREWARM_MAX_TICKS = controlNumber("prewarmMaxTicks");
const PREWARM_BUDGET_MS = controlNumber("prewarmBudgetMs");
/** Fit padding: a fixed, UI-scaled pixel margin reserved on EVERY edge when framing, so
 *  the framed graph never touches the canvas rim. A true pixel gap (zoom-independent),
 *  unlike a fractional factor whose apparent margin shrinks as the graph span grows; the
 *  framed bounds already cover node BODIES (graphBounds/fitToNodes expand by node radius),
 *  so this is clear space beyond the outermost node bodies. */
const FIT_PADDING_PX = controlNumber("fitPaddingPx");
/** Fractional inset of the minimap overview from the minimap canvas edges. */
const MINIMAP_INSET = controlNumber("minimapInset");
// Camera zoom band + step factors. This is the LIVE field clamp (cameraCore's
// MIN/MAX_SCALE is the retired Camera-class path; the registry names that drift).
const ZOOM_MIN = controlNumber("zoomMin");
const ZOOM_MAX = controlNumber("zoomMax");
const ZOOM_STEP_BUTTON = controlNumber("zoomStepButton");
const ZOOM_STEP_WHEEL = controlNumber("zoomStepWheel");
/** Trackpad pinch zoom sensitivity: factor = exp(-deltaY × this) per pinch wheel event. */
const PINCH_ZOOM_SENSITIVITY = controlNumber("pinchZoomSensitivity");
// Autoframe (graph-autoframe): poll the graph bounds on an INTERVAL (not every frame) and
// ease the camera to the fit when the frame drifts beyond a deadband — never per-frame, so
// it can't fight the settle or jitter. Local interaction-tuning constants (dimensionless /
// ms), mirroring NODE_RECEDE_MIX etc.; not user-tunable look params.
const AUTOFRAME_POLL_MS = 400; // bounds-poll cadence while autoframe is on
const AUTOFRAME_EASE = 0.16; // per-frame lerp toward the target (smooth, not a snap)
const AUTOFRAME_DEADBAND = 0.07; // min fractional frame change (center/zoom) to re-target
const AUTOFRAME_SETTLE_EPS = 0.004; // within this fraction of target → snap + stop easing
// Label LOD + ring treatment (read from the registry; one definition each).
const LABEL_BUDGET = controlNumber("labelBudget");
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
// Max canvas label width before ellipsis (screen px at UI scale 1; multiplied by
// uiScale at draw). The bare canvas label is ELIDED here so an over-long title can
// never paint an unbounded line across the field — the FULL title lives in the DOM
// HoverCard (binding graph-ui "Label … truncated with ellipsis, full title in the
// HoverCard"). A fixed legibility threshold, not a user-tunable look param.
const LABEL_MAX_WIDTH_PX = 200;
// Interactive (hover/select/pin) labels render as a design PILL — a rounded, paper-filled
// chip with a hairline scene-rule border, not naked text — so the focused label reads as a
// deliberate design element above the field (ambient DOI labels stay plate-less). The text
// is SANITIZED (whitespace collapsed, control chars stripped) and elided to a FIXED max
// character length before the width fit, so a pathological title can never blow the chip
// out. Screen-px at UI scale 1, multiplied by uiScale at draw.
const LABEL_MAX_CHARS = 48; // fixed sanitized character cap for an interactive label
const LABEL_PILL_PAD_X_PX = 7; // horizontal padding inside the pill
const LABEL_PILL_PAD_Y_PX = 3; // vertical padding inside the pill
const LABEL_PILL_GAP_PX = 6; // gap from the node body to the pill
// Icon mode (graph-node-icons): the circle ↔ doc-type-icon cross-fade by on-screen
// node size. Below LO the node is a plain dot (an icon would be sub-legible — the marks
// are gated at 14px); above HI it is the full icon; between, the two cross-fade. The
// icon quad is drawn a touch larger than the dot it replaces so the silhouette reads.
// Local render constants (mirroring NODE_RECEDE_MIX / FOCUS_RING_WIDTH_PX above), not
// schema knobs — they are fixed legibility thresholds, not user-tunable look params.
// Icon-INSIDE-circle (graph-icon-inside-circle): the doc-type icon is drawn WITHIN the
// filled disc as one composite mark, so its half-extent is a FRACTION of the node radius
// (≈62% of the disc DIAMETER) — padded inside the rim, not larger than the disc.
const ICON_SIZE_MULT = 0.7; // icon half-extent vs node radius (~70% diameter, inside the disc)
// Icon LOD fade: the inner icon fades in by ON-SCREEN node radius. Tuned LOW so icon mode
// is actually VISIBLE at normal zoom — a 1214-node graph fit to the viewport clamps every
// node to ~1.5–4px on screen, so the old 6/12px thresholds meant the icon NEVER appeared
// until the user zoomed deep into a cluster (the "icon mode does nothing" regression #39).
// At these values a node fully shows its icon by ~4px (the fit-zoom hub size) and fades out
// only for sub-legible specks below ~2px.
const ICON_FADE_LO_PX = 2; // node radius (screen px) where the inner icon begins to appear
const ICON_FADE_HI_PX = 4; // ...and is fully shown
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

/** Memoized 2D-overlay token→CSS derivations (SGR-006), keyed on theme epoch +
 *  root font size. */
type OverlayThemeDerived = {
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

/** Sanitize + fixed-length-elide a canvas label: collapse all whitespace runs (incl.
 *  newlines/tabs) to single spaces, trim, and cap to a FIXED character length with a
 *  trailing ellipsis. A pathological title (newlines, thousands of chars) can therefore
 *  never paint an unbounded or broken line; the width fit (`fitLabel`) bounds the
 *  remainder. The full title lives in the DOM HoverCard. */
function sanitizeLabel(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > LABEL_MAX_CHARS
    ? clean.slice(0, LABEL_MAX_CHARS - 1).trimEnd() + "…"
    : clean;
}

/** Format a number as a GLSL float literal so an integer default (e.g. 240) compiles
 *  as `240.0`, not the bare int `240` that GLSL rejects where a float is required. */
function glslFloat(n: number): string {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

/** Normalised magnitude of a live force-param change: the MAX over the changed numeric
 *  knobs of |Δ| / (schema max − min), clamped to [0,1]. 0 ⇒ nothing actually changed
 *  (skip the reheat). Drives the change-proportional gentle reheat so a tiny slider
 *  nudge barely warms the layout while a large retune warms more. */
function forceChangeFraction(
  prev: D3ForceParams,
  next: Partial<D3ForceParams>,
): number {
  let frac = 0;
  for (const key of Object.keys(next) as (keyof D3ForceParams)[]) {
    const nv = next[key];
    const pv = prev[key];
    if (typeof nv !== "number" || typeof pv !== "number" || nv === pv) continue;
    const spec = specById(key);
    const span =
      spec && typeof spec.min === "number" && typeof spec.max === "number"
        ? spec.max - spec.min
        : 0;
    const f = span > 0 ? Math.abs(nv - pv) / span : 1;
    if (f > frac) frac = f;
  }
  return Math.min(1, frac);
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
// Icon mode: the disc is ALWAYS drawn at full opacity — the doc-type icon is drawn INSIDE
// it (the sibling glyph mesh), so circle + icon read as ONE composite mark. The disc no
// longer fades out for the icon (graph-icon-inside-circle); the icon's own size-LOD fade
// lives in the glyph shader.
const float NODE_MIN_PX = ${glslFloat(controlNumber("nodeMinPx"))}; // floor on screen — visible zoomed out (schema nodeMinPx)
const float NODE_MAX_PX = ${glslFloat(controlNumber("nodeMaxPx"))}; // ceiling on screen — no balloon zoomed in (schema nodeMaxPx)

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
uniform vec3 uIconInkLight; // knockout colour for a dark/saturated disc (paper)
uniform vec3 uIconInkDark; // ink colour for a light disc
varying vec2 vUv;
varying vec3 vColor;
varying float vDim;
varying float vFade;

void main() {
  float cov = texture2D(uAtlas, vUv).r;
  // The icon sits INSIDE the filled disc as one composite mark: pick a CONTRASTING ink by
  // the disc colour's luminance — a paper knockout on a dark/saturated disc, dark ink on a
  // light disc — so the glyph is legible on ANY category fill. A de-emphasised node fades
  // its icon with the receding disc.
  float a = cov * vFade * (vDim > 0.5 ? 0.4 : 1.0);
  if (a <= 0.01) discard;
  float lum = dot(vColor, vec3(0.299, 0.587, 0.114));
  vec3 col = lum > 0.6 ? uIconInkDark : uIconInkLight;
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
  // Visual-only feature META-HIGHLIGHT (#16): a SET of nodes shown with the hover-style
  // soft emphasis (members keep full colour, non-members recede) but NO selection ring —
  // distinct from `selectedIds`, which is enforced SINGLETON (the graph rings at most one).
  private metaHighlightIds: ReadonlySet<string> = new Set();
  // DURABLE feature-cluster spotlight: the SELECTED FEATURE tag (feature-selection-global-
  // state). Stored as a tag — NOT a frozen id set — so the member cohort is re-derived from
  // `featureCohort` on every `setData`, surviving data refreshes. `null` = no feature spotlit.
  private spotlightFeatureTag: string | null = null;
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
  // SGR-005 pointer-delta pick cache: the last hit test's screen point + result,
  // valid only while nothing that affects a pick (positions, camera, data, size)
  // has changed. `frame()` clears it on any dirty work and `setData` clears it on
  // a node-set change, so a reuse is provably against an unchanged scene.
  private lastPickSx = NaN;
  private lastPickSy = NaN;
  private lastPickId: string | null = null;
  private pickCacheValid = false;
  // GL-context-restore attempt counter (bounded retry on webglcontextrestored).
  private glRestoreAttempts = 0;
  // FPS-adaptive LOD (perf hardening): EMA of render cost + a hysteresis-gated degraded flag.
  private frameMsEma = 0;
  private perfDegraded = false;
  // SGR-006: the 2D overlay passes (drawLabels/renderMinimap) re-derive token→CSS
  // hex strings + label text styles every frame, though they change only per THEME
  // and per UI scale. `themeEpoch` bumps on `refresh-theme`; the cache re-derives
  // when the epoch or the (cached) root font size changes — otherwise it is reused.
  private themeEpoch = 0;
  private overlayThemeCache: OverlayThemeDerived | null = null;

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
  // Two-finger touch gesture (trackpad/touch QoL): while two fingers are down the
  // pointer-event pan is suppressed and the centroid drives pan + the spread drives
  // pinch-zoom. Torn down when fewer than two touches remain.
  private touchGesture = false;
  private lastTouchCentroid: { x: number; y: number } | null = null;
  private lastTouchDist = 0;
  // Autoframe (graph-autoframe): when on (default), an interval polls the graph bounds and,
  // when the fit drifts beyond the deadband, sets an eased camera target the render loop
  // glides toward. Skipped while the user interacts; the timer is bounded + torn down.
  private autoframe = true;
  private autoframeTimer = 0;
  private autoframeTarget: { x: number; y: number; zoom: number } | null = null;
  private autoframedFrame: { x: number; y: number; zoom: number } | null = null;
  // Arbitration with a one-shot USER selection-frame (graph-follow-mode #13): a
  // `frame-nodes` selection-frame SUSPENDS whole-graph autoframe so it never yanks the
  // camera back off the user's focused subset. Cleared on the next DATA change (set-data)
  // or an explicit fit-all / autoframe re-enable — so autoframe resumes on load/data
  // change, never over a selection write.
  private autoframeSuspended = false;
  // Off-slice focus (graph-follow-mode #42): a `focus-node` for a node NOT currently
  // mounted (a rail/activity-rail/search open whose ego-expand materializes it a fetch
  // later) is REMEMBERED as a single pending id and centered when it next arrives in a
  // set-data/merge. Cleared on arrival, or when a newer explicit focus/fit/selection
  // supersedes it. Bounded to ONE id.
  private pendingFocusId: string | null = null;

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
    // Autoframe is ON by default — start its bounded bounds-poll (the Stage syncs the
    // store's toggle state via set-autoframe; a paused store value flips it off).
    if (this.autoframe) this.startAutoframeTimer();
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
    this.stopAutoframeTimer();
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
    this.pulseTimer = 0;
    this.scheduled = false;
    // SGR-007 total teardown: disposeGraph() already tears down the node/edge
    // meshes + materials + positionTex AND (via disposeGlyphs) the glyph mesh +
    // material, so no retained mesh references the atlas texture disposed just
    // below. Reset the atlas-failed latch too (mirroring rebuildGLResources), so a
    // remount rebuilds the atlas cleanly through the normal set-data → buildGlyphs
    // path rather than inheriting a stale "failed" flag.
    this.disposeGraph();
    this.glyphAtlas?.texture.dispose();
    this.glyphAtlas = null;
    this.glyphAtlasFailed = false;
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
        // through `set-meta-highlight`, never a multi-id selection.
        const first = cmd.ids.values().next().value;
        this.selectedIds = first === undefined ? new Set() : new Set([first]);
        this.applyEmphasis();
        this.requestRender();
        break;
      }
      case "set-meta-highlight":
        // Visual-only feature highlight (#16): soft hover-style emphasis of the member set,
        // NO selection ring. Empty set clears it.
        this.metaHighlightIds = new Set(cmd.ids);
        this.applyEmphasis();
        this.requestRender();
        break;
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
        else this.running = false;
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
          this.running = false;
        } else if (this.solver && !this.solver.isSettled()) {
          this.running = true;
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
  private refreshTheme(): void {
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
  private overlayTheme(): OverlayThemeDerived {
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

  private setData(
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
      const x = this.cpuPositions[idx * 4];
      const y = this.cpuPositions[idx * 4 + 1];
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
    this.metaHighlightIds = new Set(); // a data change clears a stale feature highlight (#16)
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
    if (warm && !swap.continueSettle) {
      this.solver.prewarmReflow(
        (i) => swap.movableIds.has(nodes[i].id),
        swap.startAlpha,
        this.frozen ? 0 : undefined,
      );
    } else if (warm) {
      this.solver.prewarm(
        this.frozen ? 0 : PREWARM_MAX_TICKS,
        PREWARM_BUDGET_MS,
        Math.max(swap.startAlpha, Math.min(priorAlpha, COLD_START_ALPHA)),
      );
    } else {
      this.solver.prewarm(this.frozen ? 0 : PREWARM_MAX_TICKS, PREWARM_BUDGET_MS);
    }
    this.solver.pack(this.cpuPositions);
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
    this.running = !this.frozen && !this.solver.isSettled();
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
  private applyDeltas(deltas: SceneDelta[]): void {
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

  /** The two contrasting icon inks for the inside-disc glyph (graph-icon-inside-circle):
   *  a PAPER knockout for a dark/saturated disc and a dark INK for a light disc — both
   *  theme tokens, picked per node by the disc-colour luminance in the glyph shader. */
  private iconInk(which: "light" | "dark"): [number, number, number] {
    const c = new Color(which === "light" ? canvasBackground() : inkColor());
    return [c.r, c.g, c.b];
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
        uIconInkLight: { value: this.iconInk("light") },
        uIconInkDark: { value: this.iconInk("dark") },
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
    // Clear the id/adjacency/position structures so an EMPTY graph is empty everywhere
    // (GIR-008): the n===0 set-data path returns early WITHOUT rebuilding these, so a
    // leftover idToIndex + cpuPositions would let emitAnchors resolve a tracked id and
    // focusNode centre on a ghost node over a blank canvas. The non-empty path rebuilds
    // all four before use (idToIndex, neighbors, featureCohort, cpuPositions), so
    // clearing here is safe for both paths.
    this.idToIndex = new Map();
    this.neighbors = new Map();
    this.featureCohort = new Map();
    this.cpuPositions = new Float32Array(0);
    // SGR-005: the node set + positions just changed, so any cached pick is stale
    // — invalidate synchronously (a pick can run before the next frame clears it).
    this.pickCacheValid = false;
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
    // DURABLE feature-cluster spotlight (feature-selection-global-state): a selected
    // feature emphasises its member cohort — derived LIVE from `featureCohort` (rebuilt
    // every setData) plus the feature node itself when rendered — so the spotlight is
    // re-derived (never lost) across a data reload. Sits ABOVE the generic selected-ids
    // branch so a `feature:<tag>` id can never fall through and dim the whole graph. An
    // all-absent cohort yields no emphasis (returns null) rather than dimming everything.
    if (this.spotlightFeatureTag) {
      const set = new Set<string>();
      for (const id of this.featureCohort.get(this.spotlightFeatureTag) ?? []) {
        if (this.idToIndex.has(id)) set.add(id);
      }
      const featureNodeId = `feature:${this.spotlightFeatureTag}`;
      if (this.idToIndex.has(featureNodeId)) set.add(featureNodeId);
      return set.size > 0 ? set : null;
    }
    if (this.selectedIds.size > 0) {
      const set = new Set<string>(this.selectedIds);
      for (const id of this.selectedIds) {
        for (const nb of this.neighbors.get(id) ?? []) set.add(nb);
      }
      return set;
    }
    // Feature META-HIGHLIGHT (#16): lowest-precedence focus cohort — the highlighted
    // member set is emphasised (non-members recede) with the SAME soft treatment as hover,
    // but no ring (rings are keyed off selectedIds/hoveredId only). Only the members that
    // are actually present contribute; an all-absent set yields no emphasis (returns null).
    if (this.metaHighlightIds.size > 0) {
      const set = new Set<string>();
      for (const id of this.metaHighlightIds) {
        if (this.idToIndex.has(id)) set.add(id);
      }
      return set.size > 0 ? set : null;
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

  /** Resume ticking after a pause — ENERGY-NEUTRAL (GIR-002). Resumes an in-flight
   *  settle WITHOUT pumping new heat; a graph already at rest stays exactly put. An
   *  explicit re-energise is reheatNow()'s job, never resume()'s. Mirrors the set-frozen
   *  unfreeze path so pause/resume and freeze/unfreeze behave identically.
   *
   *  This is the accepted stability design, not a limitation (ADR "graph simulation
   *  stability model", Option B): a settled layout is a frozen-yet-authoritative state
   *  held still by pinning, so resuming must NOT re-inject energy — doing so would
   *  displace an at-rest layout for no user action. Every energy-injecting path is a
   *  deliberate, named entry point (set-data warm-start, setForceParams retune,
   *  reheatNow restart); resume is not one of them. The reserved Option-A anneal (make
   *  rest a true force-field fixed point) is revisited only under the recorded re-open
   *  trigger: at-rest displacement or contact micro-buzz recurring after these valves
   *  close. */
  private resume(): void {
    if (this.frozen || !this.solver) return;
    if (!this.solver.isSettled()) {
      this.running = true;
      this.wake();
    }
  }

  reheatNow(): void {
    this.reheat();
  }

  /** Flag the position texture for re-upload after pack() writes cpuPositions. */
  private uploadPositions(): void {
    if (this.positionTex) this.positionTex.needsUpdate = true;
  }

  /** Re-tune the force parameters live (graph-lab knob set) and reheat GENTLY +
   *  PROPORTIONALLY: the kick is scaled to how far the changed knobs actually moved
   *  (normalised by each control's schema range), so a small nudge re-settles softly in
   *  place and only a large retune warms more — never the old violent global 0.5
   *  re-explode. A no-op set (identical params) skips the reheat entirely. */
  setForceParams(params: Partial<D3ForceParams>): void {
    const frac = forceChangeFraction(this.params, params);
    this.params = { ...this.params, ...params };
    if (this.solver && frac > 0) {
      // A floor (0.3×) keeps even a tiny nudge perceptibly responsive; the full gentle
      // alpha is reserved for a full-range change.
      this.solver.setParams(this.params, GENTLE_REHEAT_ALPHA * Math.max(0.3, frac));
      this.running = true;
      this.wake();
      // A force-param (simulation) change reshapes the layout: when autoframe is on, bind to
      // it (re-engage even if a prior manual nav had disengaged). The running loop's poll then
      // tracks the bounds as the layout re-settles.
      this.reengageAutoframe();
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
      // The disc is always drawn (no uIconMode fade now); icon mode only toggles whether the
      // inside-disc glyph layer is present/visible.
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

    // A node-SIZE (display) change alters each node's body radius, so the framed bounds
    // change (graphBounds expands by radius): when autoframe is on, bind to it and re-frame.
    // Edge/icon-only changes do not move bounds, so they do not re-engage.
    if (sizeChanged) this.reengageAutoframe();

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

    // Autoframe ease (graph-autoframe): glide the camera one step toward the polled fit
    // target. Keeps the loop alive while easing so it animates smoothly even at GPU idle.
    let easing = false;
    if (this.autoframeTarget) {
      easing = this.stepAutoframe();
      dirty = true;
    }

    // SGR-005: any dirty frame may have moved node positions (tick+pack), the
    // camera (autoframe ease), the data, or the viewport (resize sets needsRender)
    // — all pick inputs — so the pointer-delta pick cache is no longer valid.
    if (dirty) this.pickCacheValid = false;

    // Skip the GPU render while the canvas host is HIDDEN (graph toggled off → host
    // display:none → 0×0, #11): the CPU sim above still advances so the layout settles
    // off-screen, but zero GPU work is done. On re-show the ResizeObserver fires
    // resize→requestRender and the next frame paints the current state (no blank). This
    // makes "hidden == 0 GPU" hold even mid-settle, beyond the settled render-on-demand
    // idle. Mirrors the autoframe hidden-pause guard.
    const el = this.renderer?.domElement;
    const hidden = !el || el.clientWidth === 0 || el.clientHeight === 0;
    if (dirty && !hidden) {
      const t0 = performance.now();
      this.renderFrame();
      this.updatePerfLod(performance.now() - t0);
    }
    if (this.running || this.needsRender || easing) this.wake();
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
      // A filtered-out node hides its DOM anchor (opened island / hover card) — the
      // same visibleNodeIds mask the ring + label passes honor (GS-004) — so an overlay
      // never floats over a node the filter has hidden. Selection/tracking survives the
      // filter (desirable); only the ghost anchor is suppressed, and it re-emits when the
      // filter releases the node — no state change.
      const masked = this.visibleNodeIds !== null && !this.visibleNodeIds.has(id);
      const p = i === undefined || masked ? null : this.worldToScreen(i);
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

    // SGR-006: theme/scale-derived colours + label styles from the per-epoch cache.
    const {
      ink,
      accent,
      highlight,
      inkMuted,
      pillFill,
      pillBorder,
      featureStyle,
      docStyle,
    } = this.overlayTheme();
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
      // A filtered-out node draws no emphasis ring (GS-004): the same visibleNodeIds
      // mask the label pass (labelVisible) and picking already honor, and the node body
      // scales to zero via aHidden. Selection/pin survives the filter (desirable) — only
      // the ghost ring over the hidden node is suppressed; it reappears when the filter
      // releases the node, no state change.
      if (this.visibleNodeIds && !this.visibleNodeIds.has(id)) continue;
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
    // "graph/Label — Feature | Document"): feature = Label/12, document = Meta/11. Sizes
    // are rem-relative (resolved against the root font size in labelStyle) so canvas labels
    // scale with the DOM under one UI scale — never a hardcoded px. Labels appear ONLY on
    // interaction (hover / select / pin, per labelVisible) and render as a design PILL
    // (drawLabelPill) — there are no ambient always-on labels.
    ctx.textBaseline = "middle";
    // FPS-adaptive LOD: quarter the label clutter cap when frames are slow (updatePerfLod).
    let budget = this.perfDegraded
      ? Math.max(24, Math.floor(LABEL_BUDGET / 4))
      : LABEL_BUDGET; // clutter cap
    for (let i = 0; i < this.nodes.length && budget > 0; i++) {
      const node = this.nodes[i];
      if (!this.labelVisible(node)) continue;
      const p = this.worldToScreen(i);
      if (!p || p.x < -40 || p.x > this.width + 40 || p.y < 0 || p.y > this.height)
        continue;
      const r = Math.max(3 * s, nodeWorldRadius(node, this.appearance) * ppw);
      const isFeature = node.kind === "feature";
      const style = isFeature ? featureStyle : docStyle;
      ctx.font = style.font;
      // The label text is SANITIZED (whitespace collapsed, control chars stripped) and
      // elided to a FIXED character cap, then bounded to a screen width; the full title
      // lives in the DOM HoverCard.
      const text = this.fitLabel(
        ctx,
        sanitizeLabel(node.title ?? node.id),
        LABEL_MAX_WIDTH_PX * s,
      );
      // Label colour by focus membership while an emphasis is active (graph/Hover parity):
      // focus labels read in ink, context labels in the muted taupe. Off-emphasis, the
      // default feature=ink / document=ink-muted ramp applies.
      const labelInk = focus
        ? focus.has(node.id)
          ? ink
          : inkMuted
        : isFeature
          ? ink
          : inkMuted;
      // Every visible label is an interaction (hover / select / pin) and renders as the
      // design PILL — a rounded paper chip with a hairline border. There are no ambient
      // plate-less labels any more (the field never paints naked text without a hover).
      const x = p.x + r + LABEL_PILL_GAP_PX * s;
      this.drawLabelPill(
        ctx,
        x,
        p.y,
        text,
        style.sizePx,
        labelInk,
        pillFill,
        pillBorder,
        s,
      );
      budget--;
    }
    ctx.globalAlpha = 1;
  }

  /** Draw an interactive label as a design PILL: a rounded, paper-filled chip with a
   *  hairline scene-rule border and the ink text centred inside, left-anchored at `x` and
   *  vertically centred on `y`. Padding/radius are UI-scaled. The chip's paper fill is
   *  opaque so it occludes the edges/nodes behind the text, keeping the focused label
   *  crisply legible above the field. */
  private drawLabelPill(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    fontPx: number,
    inkCss: string,
    fillCss: string,
    borderCss: string,
    s: number,
  ): void {
    const padX = LABEL_PILL_PAD_X_PX * s;
    const padY = LABEL_PILL_PAD_Y_PX * s;
    const tw = ctx.measureText(text).width;
    const w = tw + padX * 2;
    const h = fontPx + padY * 2;
    const top = y - h / 2;
    const radius = h / 2; // full pill
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.roundRect(x, top, w, h, radius);
    ctx.fillStyle = fillCss;
    ctx.fill();
    ctx.lineWidth = Math.max(1, s);
    ctx.strokeStyle = borderCss;
    ctx.stroke();
    ctx.fillStyle = inkCss;
    ctx.fillText(text, x + padX, y);
  }

  /** Elide a label to at most `maxWidth` screen px with a trailing ellipsis,
   *  measured in the ctx's CURRENT font. Returns the text unchanged when it fits;
   *  otherwise binary-searches the longest prefix that fits with the ellipsis
   *  appended. One `measureText` for the common (fits) case; ~log2(len) extra only
   *  for the long labels this exists to bound. */
  private fitLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ): string {
    if (maxWidth <= 0 || ctx.measureText(text).width <= maxWidth) return text;
    const ellipsis = "…";
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo > 0 ? text.slice(0, lo) + ellipsis : ellipsis;
  }

  private labelVisible(node: SceneNodeData): boolean {
    // Labels appear ONLY on a real interaction — hover, selection, or pin — and render as
    // the design PILL (drawLabelPill). There are NO ambient/always-on labels: the field no
    // longer paints naked text on every feature or high-salience document (the user's
    // "nodes displaying hover information without any hover" + "overflowing black text"
    // complaint). A filtered-out node is never labelled.
    if (this.visibleNodeIds && !this.visibleNodeIds.has(node.id)) return false;
    return (
      this.hoveredId === node.id ||
      this.selectedIds.has(node.id) ||
      this.pinnedIds.has(node.id)
    );
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

  /** Axis-aligned bounding box over all live node BODIES (each centre expanded by its
   *  world radius), or null when there are no finite positions yet. Expanding by the node
   *  radius — not just the centre — is what lets the fit guarantee every node's body is
   *  inside the canvas; framing bare centres half-clips a peripheral node by its radius.
   *  Shared by fitToView (cold framing) and the minimap. */
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
      // Visibility-aware: when a filter mask is active, frame only the VISIBLE subset so a
      // filter change tightens the fit to what is shown (a hidden node never holds the frame
      // open). With no mask (visibleNodeIds null) every node counts, as before.
      if (
        this.visibleNodeIds &&
        i < this.nodes.length &&
        !this.visibleNodeIds.has(this.nodes[i].id)
      ) {
        continue;
      }
      const x = this.cpuPositions[i * 4];
      const y = this.cpuPositions[i * 4 + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const r =
        i < this.nodes.length ? nodeWorldRadius(this.nodes[i], this.appearance) : 0;
      if (x - r < minX) minX = x - r;
      if (x + r > maxX) maxX = x + r;
      if (y - r < minY) minY = y - r;
      if (y + r > maxY) maxY = y + r;
    }
    return minX > maxX ? null : { minX, minY, maxX, maxY };
  }

  private fitToView(): void {
    const b = this.graphBounds();
    if (!b) return this.fitToSeed();
    this.frameBounds(b.minX, b.minY, b.maxX, b.maxY);
  }

  /** One-shot frame to a SUBSET of nodes (follow-mode-selection-sync, #13): fit the camera
   *  to the bounding box of the given ids — the rail feature-select frame for that feature's
   *  members. Unknown/non-finite ids are skipped; an empty/all-unknown set is a NO-OP (the
   *  camera holds). A single node frames with a sensible margin so it doesn't slam to max
   *  zoom. Mirrors fitToView's fit math via frameBounds; the caller suspends autoframe so
   *  this deliberate user move is not immediately re-fit to the whole graph. */
  private fitToNodes(ids: ReadonlySet<string>): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let count = 0;
    let maxR = 0;
    for (const id of ids) {
      const i = this.idToIndex.get(id);
      if (i === undefined) continue;
      const x = this.cpuPositions[i * 4];
      const y = this.cpuPositions[i * 4 + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const r = nodeWorldRadius(this.nodes[i], this.appearance);
      if (r > maxR) maxR = r;
      count++;
    }
    if (count === 0) return; // empty / all-unknown → no-op
    // Pad by a node radius (+ a small margin) so a single/tight cluster frames with breathing
    // room instead of zooming to the ceiling on a zero-span bbox.
    const margin = Math.max(maxR * 3, 1);
    this.frameBounds(minX - margin, minY - margin, maxX + margin, maxY + margin);
  }

  /** The camera {x, y, zoom} that fits the given bounds with the standard padding —
   *  the pure fit math, shared by the one-shot frameBounds and the eased autoframe. */
  private fitTargetForBounds(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ): { x: number; y: number; zoom: number } {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    // Reserve a fixed, UI-scaled pixel margin on every edge: the graph fits into the
    // canvas MINUS 2×pad on each axis, so there is always a visible gap between the framed
    // node bodies and the canvas rim. Pixels-per-world is isotropic here (pixelsPerWorld()),
    // so the SAME ppw fits both axes; the tighter axis wins. zoom solves
    // ppw = (height / viewHeight) × zoom.
    const padPx = FIT_PADDING_PX * uiScale();
    const usableW = Math.max(1, this.width - 2 * padPx);
    const usableH = Math.max(1, this.height - 2 * padPx);
    const ppw = Math.min(usableW / spanX, usableH / spanY);
    const zoom = Math.max(
      ZOOM_MIN,
      Math.min(ZOOM_MAX, (ppw * this.viewHeight) / this.height),
    );
    return { x: cx, y: cy, zoom };
  }

  private frameBounds(minX: number, minY: number, maxX: number, maxY: number): void {
    const t = this.fitTargetForBounds(minX, minY, maxX, maxY);
    // A manual fit cancels any in-flight autoframe ease and records the new frame so the
    // autoframe deadband measures drift from here (no immediate re-fit fighting the user).
    // It also supersedes a pending off-slice focus (#42) — an explicit fit/frame is a newer
    // camera intent. (The warm set-data arrival path skips fitToView, so the pending focus
    // there still survives to its arrival check.)
    this.autoframeTarget = null;
    this.autoframedFrame = t;
    this.pendingFocusId = null;
    this.camera.position.set(t.x, t.y, 10);
    this.camera.zoom = t.zoom;
    this.camera.updateProjectionMatrix();
    this.emitCameraChange();
    this.requestRender();
  }

  // --- autoframe (graph-autoframe) -----------------------------------------

  /** Toggle autoframe. ON starts the bounded bounds-poll interval; OFF clears it and any
   *  in-flight ease, holding the camera for full manual control. */
  private setAutoframe(enabled: boolean): void {
    if (this.autoframe === enabled) {
      if (enabled && this.autoframeTimer === 0) this.startAutoframeTimer();
      return;
    }
    this.autoframe = enabled;
    if (enabled) {
      // Re-enabling autoframe is a fresh start — drop any selection-frame / manual-nav
      // suspension so the toggle reasserts whole-graph framing (#13 arbitration), and frame
      // immediately (reengageAutoframe polls now) rather than waiting for the next poll tick.
      this.startAutoframeTimer();
      this.reengageAutoframe();
    } else {
      this.stopAutoframeTimer();
      this.autoframeTarget = null;
    }
  }

  private startAutoframeTimer(): void {
    this.stopAutoframeTimer();
    this.autoframeTimer = window.setInterval(
      () => this.autoframePoll(),
      AUTOFRAME_POLL_MS,
    );
  }

  private stopAutoframeTimer(): void {
    if (this.autoframeTimer) {
      clearInterval(this.autoframeTimer);
      this.autoframeTimer = 0;
    }
  }

  /** True while the user is directly driving the camera/a node — autoframe never fights it. */
  private isUserInteracting(): boolean {
    return (
      this.dragging || this.dragNodeIndex >= 0 || this.touchGesture || this.dragActive
    );
  }

  /** The user took manual CAMERA control (pan / zoom / wheel / pinch / minimap): DISENGAGE
   *  autoframe — drop any in-flight ease and suspend re-framing — so it never yanks the view
   *  back. Autoframe stays in its ON mode (the toggle is unchanged) but holds off until a
   *  STATE change (filter/visibility/appearance/force) or an explicit fit/toggle re-engages
   *  it (`reengageAutoframe`). A no-op when autoframe is already off. */
  private disengageAutoframeForUserNav(): void {
    if (!this.autoframe || this.autoframeSuspended) return;
    this.autoframeSuspended = true;
    this.autoframeTarget = null;
  }

  /** A graph STATE change happened (new data, filter/visibility, appearance, force params):
   *  if autoframe is ON, RE-ENGAGE it — clear the user-nav/selection suspension and
   *  re-evaluate the fit immediately so the camera binds to the new graph without waiting for
   *  the next poll tick. The poll's deadband still guards an unchanged frame, so a state
   *  change that does not move the bounds costs nothing. A no-op when autoframe is off. */
  private reengageAutoframe(): void {
    if (!this.autoframe) return;
    this.autoframeSuspended = false;
    // Measure the poll's drift from the CURRENT camera, not the last auto-fit: a manual nav
    // moved the camera without updating `autoframedFrame`, so without this the poll would
    // compare the bounds-fit against the stale frame, see no drift, and leave the camera at
    // the user's manual position — failing to re-frame. Nulling it makes the poll re-fit from
    // wherever the camera now is.
    this.autoframedFrame = null;
    this.autoframePoll();
  }

  /** Interval poll: when autoframe is on and the user is idle, compute the fit target and,
   *  if the frame has drifted beyond the deadband (hysteresis — so a settled/unchanged
   *  graph never re-eases and jitters), set the eased target the render loop glides toward. */
  private autoframePoll(): void {
    if (!this.autoframe || this.autoframeSuspended || !this.renderer) return;
    if (this.isUserInteracting()) return;
    // Don't poll/reframe a HIDDEN graph (#11): when the canvas host is display:none'd (the
    // graph toggled off), its box collapses to 0×0 — skip until it is shown again. The
    // interval keeps ticking but does no work; self-detected from the DOM, so no cross-layer
    // visibility signal is needed (works for any hide mechanism fixer-3 uses).
    const el = this.renderer.domElement;
    if (el.clientWidth === 0 || el.clientHeight === 0) return;
    const b = this.graphBounds();
    if (!b) return;
    const target = this.fitTargetForBounds(b.minX, b.minY, b.maxX, b.maxY);
    const ref = this.autoframedFrame ?? {
      x: this.camera.position.x,
      y: this.camera.position.y,
      zoom: this.camera.zoom,
    };
    // Fractional drift: center shift relative to the on-screen span + relative zoom change.
    const worldHalfH = this.viewHeight / 2 / Math.max(target.zoom, 1e-6);
    const centerDrift =
      Math.hypot(target.x - ref.x, target.y - ref.y) / Math.max(worldHalfH, 1);
    const zoomDrift = Math.abs(target.zoom - ref.zoom) / Math.max(ref.zoom, 1e-6);
    if (Math.max(centerDrift, zoomDrift) < AUTOFRAME_DEADBAND) return;
    this.autoframeTarget = target;
    this.wake();
  }

  /** One eased step toward the autoframe target; called from the render loop. Returns true
   *  while still easing (keeps the loop alive). Snaps + clears the target when within eps. */
  private stepAutoframe(): boolean {
    const t = this.autoframeTarget;
    if (!t) return false;
    // Never fight a user who grabbed the camera mid-ease — drop the target.
    if (this.isUserInteracting()) {
      this.autoframeTarget = null;
      return false;
    }
    const cam = this.camera;
    const dz = t.zoom - cam.zoom;
    const dx = t.x - cam.position.x;
    const dy = t.y - cam.position.y;
    const worldHalfH = this.viewHeight / 2 / Math.max(t.zoom, 1e-6);
    const posClose =
      Math.hypot(dx, dy) / Math.max(worldHalfH, 1) < AUTOFRAME_SETTLE_EPS;
    const zoomClose = Math.abs(dz) / Math.max(t.zoom, 1e-6) < AUTOFRAME_SETTLE_EPS;
    if (posClose && zoomClose) {
      cam.position.set(t.x, t.y, 10);
      cam.zoom = t.zoom;
      this.autoframedFrame = t;
      this.autoframeTarget = null;
    } else {
      cam.position.x += dx * AUTOFRAME_EASE;
      cam.position.y += dy * AUTOFRAME_EASE;
      cam.zoom += dz * AUTOFRAME_EASE;
    }
    cam.updateProjectionMatrix();
    this.emitCameraChange();
    return this.autoframeTarget !== null;
  }

  private zoomBy(factor: number): void {
    this.disengageAutoframeForUserNav();
    this.camera.zoom = Math.max(
      ZOOM_MIN,
      Math.min(ZOOM_MAX, this.camera.zoom * factor),
    );
    this.camera.updateProjectionMatrix();
    this.emitCameraChange();
    this.requestRender();
  }

  /** Pan the camera by a WORLD-space delta (already divided by pixelsPerWorld), then
   *  refresh. The sign convention is the caller's: trackpad SCROLL moves the camera with
   *  the scroll delta; a DRAG (pointer / two-finger) moves it opposite the finger so the
   *  surface follows the hand. Respects nothing to clamp (panning is unbounded by design;
   *  the autoframe / fit path re-centres). */
  private panCamera(dxWorld: number, dyWorld: number): void {
    this.disengageAutoframeForUserNav();
    this.camera.position.x += dxWorld;
    this.camera.position.y += dyWorld;
    this.camera.updateProjectionMatrix();
    this.emitCameraChange();
    this.requestRender();
  }

  /** Client (page) px → canvas-local screen px, mirroring eventToScreen for a raw point
   *  (used for the touch centroid, which is computed from Touch.clientX/Y). */
  private clientToScreen(cx: number, cy: number): [number, number] {
    const rect = this.renderer?.domElement.getBoundingClientRect();
    return [cx - (rect?.left ?? 0), cy - (rect?.top ?? 0)];
  }

  /** Centroid (client px) of the first two active touches. */
  private touchCentroid(touches: TouchList): { x: number; y: number } {
    const a = touches[0];
    const b = touches[1];
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }

  /** Euclidean spread (client px) between the first two active touches. */
  private touchDistance(touches: TouchList): number {
    const a = touches[0];
    const b = touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  /** Zoom keeping the world point under (sx, sy) screen px stationary. */
  private zoomAtScreen(factor: number, sx: number, sy: number): void {
    this.disengageAutoframeForUserNav();
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
    if (i === undefined) {
      // Off-slice target (#42): not mounted yet — remember it (bounded to one) and center
      // it when it next arrives via set-data (the ego-expand materializes it a fetch later).
      this.pendingFocusId = id;
      return;
    }
    const x = this.cpuPositions[i * 4];
    const y = this.cpuPositions[i * 4 + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.camera.position.set(x, y, 10);
    this.camera.updateProjectionMatrix();
    // A successful explicit focus supersedes any older pending off-slice target.
    this.pendingFocusId = null;
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
    ctx.fillStyle = this.overlayTheme().inkMuted; // SGR-006: cached per theme epoch
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < count; i++) {
      // Match the visibility-aware bounds: a filtered-out node is not drawn on the overview.
      if (
        this.visibleNodeIds &&
        i < this.nodes.length &&
        !this.visibleNodeIds.has(this.nodes[i].id)
      ) {
        continue;
      }
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
    ctx.strokeStyle = this.overlayTheme().accent; // SGR-006: cached per theme epoch
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
      // Minimap pan is manual navigation → disengage autoframe (idempotent).
      this.disengageAutoframeForUserNav();
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
    //
    // SGR-005 pointer-delta gate: pointermove fires at device rate, so a hover
    // hold re-scans O(N) for a sub-pixel jiggle. When the pick cache is still
    // valid (no dirty frame / setData since the last pick) and the pointer moved
    // <1px, reuse the last result — provably correct because nothing that affects
    // a pick (positions, camera, data, viewport) has changed in that window.
    if (
      this.pickCacheValid &&
      (sx - this.lastPickSx) ** 2 + (sy - this.lastPickSy) ** 2 < 1
    ) {
      return this.lastPickId;
    }

    const ppw = this.pixelsPerWorld();
    // SGR-004/005: hoist the per-node loop invariants OUT of the scan. `uiScale()`
    // is a forced computed-style read (now cached, but still hoisted to one call),
    // and the camera half-extents + viewport feed the INLINED `worldToScreen`
    // projection (same math as the method) so the loop carries no invariant work.
    const pickRadiusScreen = PICK_RADIUS_PX * uiScale();
    const halfW = (this.camera.right - this.camera.left) / 2 / this.camera.zoom;
    const halfH = (this.camera.top - this.camera.bottom) / 2 / this.camera.zoom;
    const camX = this.camera.position.x;
    const camY = this.camera.position.y;
    const width = this.width;
    const height = this.height;

    let best: string | null = null;
    let bestDistSq = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      if (this.visibleNodeIds && !this.visibleNodeIds.has(this.nodes[i].id)) continue;
      const wx = this.cpuPositions[i * 4];
      const wy = this.cpuPositions[i * 4 + 1];
      if (!Number.isFinite(wx) || !Number.isFinite(wy)) continue;
      const px = ((wx - camX) / halfW / 2 + 0.5) * width;
      const py = (1 - ((wy - camY) / halfH / 2 + 0.5)) * height;
      const radius = Math.max(
        pickRadiusScreen,
        nodeWorldRadius(this.nodes[i], this.appearance) * ppw,
      );
      const dx = px - sx;
      const dy = py - sy;
      const distSq = dx * dx + dy * dy;
      if (distSq <= radius * radius && distSq < bestDistSq) {
        bestDistSq = distSq;
        best = this.nodes[i].id;
      }
    }

    this.lastPickSx = sx;
    this.lastPickSy = sy;
    this.lastPickId = best;
    this.pickCacheValid = true;
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
        // Trackpad QoL (graph-trackpad-nav): the browser delivers a trackpad PINCH as a
        // wheel event with `ctrlKey` set, and a two-finger SCROLL as a wheel event with
        // deltaX/deltaY and no modifier. So:
        //   • ctrl/⌘+wheel (pinch, or a deliberate zoom modifier) → ZOOM toward the cursor;
        //   • a classic MOUSE WHEEL (axis-locked vertical notch — no deltaX, line-mode or a
        //     coarse |deltaY|) → ZOOM, so mouse users are NOT regressed;
        //   • everything else (fine, often-horizontal two-finger trackpad scroll) → PAN.
        // preventDefault stops the page/panel from scrolling under the canvas.
        ev.preventDefault();
        const [sx, sy] = this.eventToScreen(ev);
        const pinch = ev.ctrlKey || ev.metaKey;
        const mouseWheel =
          !pinch &&
          ev.deltaX === 0 &&
          (ev.deltaMode !== 0 || Math.abs(ev.deltaY) >= 100);
        if (pinch) {
          this.zoomAtScreen(Math.exp(-ev.deltaY * PINCH_ZOOM_SENSITIVITY), sx, sy);
        } else if (mouseWheel) {
          this.zoomAtScreen(
            ev.deltaY < 0 ? ZOOM_STEP_WHEEL : 1 / ZOOM_STEP_WHEEL,
            sx,
            sy,
          );
        } else {
          // Two-finger scroll → pan (scroll sense: the camera follows the scroll delta).
          const ppw = this.pixelsPerWorld();
          this.panCamera(ev.deltaX / ppw, -ev.deltaY / ppw);
        }
      },
      { passive: false },
    );
    el.addEventListener("pointerdown", (ev: PointerEvent) => {
      // A two-finger touch gesture owns pan/zoom; ignore the per-finger pointer stream.
      if (this.touchGesture) return;
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
      if (this.touchGesture) return; // two-finger gesture owns the camera
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
        // A camera pan is manual navigation: disengage autoframe so it does not yank the
        // view back when the drag ends (idempotent — suspends once).
        this.disengageAutoframeForUserNav();
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

    // Real touch devices (graph-trackpad-nav): a TWO-FINGER gesture pans by the centroid
    // delta (drag sense — the surface follows the fingers) and pinch-zooms by the spread
    // ratio toward the centroid. Single-finger touch still flows through the pointer
    // handlers above (tap = select, one-finger drag = pan). The gesture suppresses the
    // pointer pan via `touchGesture` so the two never fight.
    el.addEventListener(
      "touchstart",
      (ev: TouchEvent) => {
        if (ev.touches.length !== 2) return;
        ev.preventDefault();
        this.touchGesture = true;
        this.dragging = false; // cancel any single-finger pan already begun
        this.endNodeDrag();
        this.lastTouchCentroid = this.touchCentroid(ev.touches);
        this.lastTouchDist = this.touchDistance(ev.touches);
      },
      { passive: false },
    );
    el.addEventListener(
      "touchmove",
      (ev: TouchEvent) => {
        if (!this.touchGesture || ev.touches.length < 2) return;
        ev.preventDefault();
        const centroid = this.touchCentroid(ev.touches);
        const dist = this.touchDistance(ev.touches);
        if (this.lastTouchCentroid) {
          const ppw = this.pixelsPerWorld();
          const dcx = centroid.x - this.lastTouchCentroid.x;
          const dcy = centroid.y - this.lastTouchCentroid.y;
          // Drag sense: surface follows the fingers (camera moves opposite).
          this.panCamera(-dcx / ppw, dcy / ppw);
        }
        if (this.lastTouchDist > 0 && dist > 0) {
          const [sx, sy] = this.clientToScreen(centroid.x, centroid.y);
          this.zoomAtScreen(dist / this.lastTouchDist, sx, sy);
        }
        this.lastTouchCentroid = centroid;
        this.lastTouchDist = dist;
      },
      { passive: false },
    );
    const endTouch = (ev: TouchEvent) => {
      if (ev.touches.length < 2) {
        this.touchGesture = false;
        this.lastTouchCentroid = null;
        this.lastTouchDist = 0;
      }
    };
    el.addEventListener("touchend", endTouch);
    el.addEventListener("touchcancel", endTouch);
  }
}
