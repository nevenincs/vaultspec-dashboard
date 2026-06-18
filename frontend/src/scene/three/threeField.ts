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
  type SceneEdgeData,
  type SceneFeatureFlags,
  type SceneFieldRenderer,
  type SceneNodeData,
  type SceneController,
  DEFAULT_SCENE_FEATURE_FLAGS,
} from "../sceneController";
import { semanticLevel } from "../field/camera";
import {
  accentColor,
  canvasBackground,
  edgeAppearance,
  inkColor,
  inkMutedColor,
  nodeColorNumber,
  nodeWorldRadius,
  readTierColors,
} from "./appearance";
import { D3_FORCE_DEFAULTS, D3ForceSolver, type D3ForceParams } from "./d3ForceSolver";

const PICK_RADIUS_PX = 14;

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

void main() {
  vec2 uv = (vec2(mod(aIndex, uTexSize), floor(aIndex / uTexSize)) + 0.5) / uTexSize;
  vec2 center = texture2D(uPositions, uv).xy;
  float scale = aHidden > 0.5 ? 0.0 : aSize;
  vec2 world = center + position.xy * scale;
  vColor = aColor;
  vDim = aDim;
  vEdge = length(position.xy); // 0 at centre → 1 at the rim
  // Analytic edge-AA band in local units: ~1.5 screen px at the rim, derived from
  // node size × zoom. Avoids fwidth/derivatives (a WebGL1 extension pitfall under
  // the GLSL1 ShaderMaterial path) and stays crisp at any size.
  float px = aSize * uPixelsPerWorld;
  vAA = px > 0.0 ? clamp(1.5 / px, 0.0, 0.5) : 0.01;
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

void main() {
  vec2 a = nodePos(aIndexA);
  vec2 b = nodePos(aIndexB);
  vec2 base = mix(a, b, aEnd);
  vec2 dir = b - a;
  float len = length(dir);
  vec2 nrm = len > 0.0001 ? vec2(-dir.y, dir.x) / len : vec2(0.0);
  float halfWorld = (aWidthPx * 0.5) / uPixelsPerWorld;
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
  private builtEdges: BuiltEdge[] = [];
  private idToIndex = new Map<string, number>();
  private neighbors = new Map<string, Set<string>>();
  private featureCohort = new Map<string, Set<string>>();
  private cpuPositions = new Float32Array(0);

  // interaction state
  private hoveredId: string | null = null;
  private selectedIds: ReadonlySet<string> = new Set();
  private pinnedIds: ReadonlySet<string> = new Set();
  private visibleNodeIds: ReadonlySet<string> | null = null;
  private featureFlags: SceneFeatureFlags = { ...DEFAULT_SCENE_FEATURE_FLAGS };

  private params: D3ForceParams = { ...D3_FORCE_DEFAULTS };
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

  mount(host: HTMLElement): void {
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
    this.scheduled = false;
    this.disposeGraph();
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
      case "set-feature-flags":
        this.featureFlags = { ...this.featureFlags, ...cmd.flags };
        if (!this.featureFlags.hover) this.setHovered(null);
        this.applyEmphasis();
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
        this.zoomBy(1.2);
        break;
      case "zoom-out":
        this.zoomBy(1 / 1.2);
        break;
      default:
        // Cosmos-specific config, representation modes, overlays, deltas, time:
        // deferred — the three field renders the same model without them.
        break;
    }
  }

  // --- data ----------------------------------------------------------------

  private setData(nodes: SceneNodeData[], edges: SceneEdgeData[]): void {
    if (!this.renderer) return;
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
    const radii = nodes.map((node) => nodeWorldRadius(node));
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

    // Flicker-free init: settle the violent early ticks OFF-SCREEN, then pack the
    // CPU mirror and fit the camera ONCE — the first visible frame is already at
    // equilibrium. If prewarm hit its wall-clock budget the layout finishes the
    // gentle remainder in the live loop; otherwise it stays frozen (idle GPU 0).
    this.solver.prewarm();
    this.solver.pack(this.cpuPositions);
    this.uploadPositions();
    this.fitToView();
    this.running = !this.solver.isSettled();
    this.requestRender();
    if (this.running) this.wake();
  }

  private buildNodes(nodes: SceneNodeData[], texSize: number): void {
    const n = nodes.length;
    const aIndex = new Float32Array(n);
    const aSize = new Float32Array(n);
    const aColor = new Float32Array(n * 3);
    const aDim = new Float32Array(n);
    const aHidden = new Float32Array(n);
    const tmp = new Color();
    nodes.forEach((node, i) => {
      aIndex[i] = i;
      aSize[i] = nodeWorldRadius(node);
      tmp.set(nodeColorNumber(node));
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
    if (valid.length === 0) return;

    const tierColors = readTierColors();
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
    const tmp = new Color();

    valid.forEach((e, i) => {
      const s = index.get(e.src) as number;
      const t = index.get(e.dst) as number;
      const ap = edgeAppearance(e, tierColors);
      tmp.set(ap.color);
      // 4 verts: 0=A-left,1=A-right,2=B-left,3=B-right
      const ends = [0, 0, 1, 1];
      const sides = [-1, 1, -1, 1];
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        aIndexA[v] = s;
        aIndexB[v] = t;
        aEnd[v] = ends[k];
        aSide[v] = sides[k];
        aWidthPx[v] = ap.width;
        aColor[v * 3] = tmp.r;
        aColor[v * 3 + 1] = tmp.g;
        aColor[v * 3 + 2] = tmp.b;
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
    this.builtEdges = [];
  }

  // --- emphasis / visibility -----------------------------------------------

  /** Active emphasis set (hover takes precedence; else shared selection). */
  private emphasisSet(): Set<string> | null {
    if (this.hoveredId && this.featureFlags.hover) {
      const set = new Set<string>([this.hoveredId]);
      for (const nb of this.neighbors.get(this.hoveredId) ?? []) set.add(nb);
      if (this.featureFlags.clusterHighlight) {
        const node = this.nodes[this.idToIndex.get(this.hoveredId) ?? -1];
        for (const tag of node?.featureTags ?? []) {
          for (const id of this.featureCohort.get(tag) ?? []) set.add(id);
        }
      }
      return set;
    }
    if (this.selectedIds.size > 0 && this.featureFlags.selection) {
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
    const alpha = this.edgeMesh.geometry.getAttribute("aAlpha");
    // edgeIds membership is by edge id; we kept only endpoint ids, so fall back to
    // endpoint visibility (both endpoints visible ⇒ shown) when an id is unknown.
    this.builtEdges.forEach((e, i) => {
      const show = nodeIds.has(e.srcId) && nodeIds.has(e.dstId);
      void edgeIds;
      for (let k = 0; k < 4; k++) {
        const base = alpha.getX(i * 4 + k);
        alpha.setX(i * 4 + k, show ? Math.max(base, 0.0001) : 0);
      }
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
    if (this.nodeMaterial) {
      this.nodeMaterial.uniforms.uPositions.value = tex;
      this.nodeMaterial.uniforms.uPixelsPerWorld.value = ppw;
    }
    if (this.edgeMaterial) {
      this.edgeMaterial.uniforms.uPositions.value = tex;
      this.edgeMaterial.uniforms.uPixelsPerWorld.value = ppw;
    }
    this.renderer.render(this.scene, this.camera);
    this.drawLabels();
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
    const ppw = this.pixelsPerWorld();

    // rings first (under labels)
    for (let i = 0; i < this.nodes.length; i++) {
      const id = this.nodes[i].id;
      const selected = this.selectedIds.has(id);
      const hovered = this.hoveredId === id;
      const pinned = this.pinnedIds.has(id);
      if (!selected && !hovered && !pinned) continue;
      const p = this.worldToScreen(i);
      if (!p) continue;
      const r = Math.max(3, nodeWorldRadius(this.nodes[i]) * ppw) + 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = accent;
      ctx.lineWidth = selected ? 2.5 : 1.5;
      if (pinned && !selected && !hovered) ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // labels — DOI by semantic level, plus always-on for hovered/selected/pinned
    ctx.font = "12px system-ui, -apple-system, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillStyle = ink;
    let budget = 220; // clutter cap
    for (let i = 0; i < this.nodes.length && budget > 0; i++) {
      const node = this.nodes[i];
      if (!this.labelVisible(node, level)) continue;
      const p = this.worldToScreen(i);
      if (!p || p.x < -40 || p.x > this.width + 40 || p.y < 0 || p.y > this.height)
        continue;
      const r = Math.max(3, nodeWorldRadius(node) * ppw);
      const text = node.title ?? node.id;
      ctx.fillStyle = node.kind === "feature" ? ink : ink;
      ctx.globalAlpha = node.kind === "feature" ? 1 : 0.85;
      ctx.fillText(text, p.x + r + 4, p.y);
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

  private fitToView(): void {
    if (!this.solver) return this.fitToSeed();
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
    if (minX > maxX) return this.fitToSeed();
    this.frameBounds(minX, minY, maxX, maxY);
  }

  private frameBounds(minX: number, minY: number, maxX: number, maxY: number): void {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const aspect = this.width / this.height;
    const zoomX = (this.viewHeight * aspect) / (spanX * 1.12);
    const zoomY = this.viewHeight / (spanY * 1.12);
    this.camera.position.set(cx, cy, 10);
    this.camera.zoom = Math.max(0.02, Math.min(50, Math.min(zoomX, zoomY)));
    this.camera.updateProjectionMatrix();
    this.emitCameraChange();
    this.requestRender();
  }

  private zoomBy(factor: number): void {
    this.camera.zoom = Math.max(0.02, Math.min(50, this.camera.zoom * factor));
    this.camera.updateProjectionMatrix();
    this.emitCameraChange();
    this.requestRender();
  }

  /** Zoom keeping the world point under (sx, sy) screen px stationary. */
  private zoomAtScreen(factor: number, sx: number, sy: number): void {
    const before = this.screenToWorld(sx, sy);
    this.camera.zoom = Math.max(0.02, Math.min(50, this.camera.zoom * factor));
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
      const radius = Math.max(PICK_RADIUS_PX, nodeWorldRadius(this.nodes[i]) * ppw);
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
    // No heat, no global re-energise: the drag pins one node; FA2's full-strength
    // attraction pulls only its force-bearing neighbours, and the adaptive speed
    // keeps it stable. Distant settled nodes carry ~0 net force → they stay put.
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
    // Keep ticking; FA2 re-converges the released neighbourhood, then it freezes.
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
        this.zoomAtScreen(ev.deltaY < 0 ? 1.1 : 1 / 1.1, sx, sy);
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
      if (!this.featureFlags.hover) return;
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
