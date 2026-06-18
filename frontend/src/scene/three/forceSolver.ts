// GPGPU ForceAtlas2 solver — a faithful port of NVIDIA cuGraph's GPU ForceAtlas2
// (rapidsai/cugraph cpp/src/layout/legacy/{exact_repulsion,fa2_kernels}.cuh), itself
// the Gephi algorithm (Jacomy, Venturini, Heymann, Bastian 2014, PLoS ONE e98679).
//
// Why FA2 and not a heat/alpha or velocity-Verlet model: FA2 is momentumless and
// converges to a TRUE equilibrium via per-node "swinging" damping + an adaptive
// global speed — it does not "settle" by removing energy, so the rest state is
// genuinely stable and a single dragged node perturbs only its force-bearing
// neighbourhood (no global reheat). Each tick:
//   force  = repulsion(kr·mi·mj·d/dist²) + linear gravity + linear attraction
//   swinging(n) = mass·|F(t) − F(t−1)|,  traction(n) = ½·mass·|F(t) + F(t−1)|
//   globalSpeed adapted from Σswinging / Σtraction (cuGraph adapt_speed)
//   displacement(n) = F · speed/(1 + √(speed·swinging(n)))
//
// GPGPU layout: a FORCE pass writes (Fx, Fy, swinging, traction) per node (reading
// its own previous force for swinging); the host reduces swinging/traction on the
// CPU to adapt the global speed; a POSITION pass applies the per-node factor. The
// global speed therefore lags the forces by one tick — negligible, since speed
// changes at most 50%/tick (cuGraph max_rise).

import {
  DataTexture,
  FloatType,
  NearestFilter,
  RGBAFormat,
  type Texture,
  type WebGLRenderer,
} from "three";
import {
  GPUComputationRenderer,
  type Variable,
} from "three/examples/jsm/misc/GPUComputationRenderer.js";

export interface ForceParams {
  /** Repulsion coefficient kr (cuGraph scaling_ratio; its default 2.0). Sets the
   *  layout scale: equilibrium edge length ≈ √(kr·mi·mj / attraction). */
  scalingRatio: number;
  /** Gravity kg toward the origin (cuGraph default 1.0) — keeps components on screen. */
  gravity: number;
  /** Linear attraction coefficient (cuGraph outbound_att_compensation; 1.0 default). */
  attraction: number;
  /** Jitter tolerance τ (cuGraph default 1.0) — higher = faster but looser. */
  jitterTolerance: number;
}

export const FORCE_DEFAULTS: ForceParams = {
  // cuGraph's calibrated defaults — the adaptive-speed `jt = …·traction/n²` term is
  // tuned for these magnitudes; scaling them up (e.g. 120) makes forces enormous and
  // the speed control diverges. Visual scale is handled by a separate display scale,
  // NOT by inflating these.
  scalingRatio: 2.0,
  gravity: 1.0,
  attraction: 1.0,
  jitterTolerance: 1.0,
};

const FORCE_SHADER = /* glsl */ `
uniform float uTexSize;
uniform float uCount;
uniform float uLinkTexSize;
uniform float uScalingRatio;
uniform float uGravity;
uniform float uAttraction;
uniform sampler2D uLinkRange;
uniform sampler2D uLinks;

vec2 indexToUV(float index, float texSize) {
  float x = mod(index, texSize);
  float y = floor(index / texSize);
  return (vec2(x, y) + 0.5) / texSize;
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  float self = floor(gl_FragCoord.y) * uTexSize + floor(gl_FragCoord.x);
  vec4 prevF = texture2D(textureForce, uv);
  if (self >= uCount) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec2 pos = texture2D(texturePosition, uv).xy;
  vec4 selfRange = texture2D(uLinkRange, uv);
  float mass = selfRange.g + 1.0; // mass = degree + 1 (FA2)

  vec2 F = vec2(0.0);

  // Repulsion (cuGraph exact_repulsion): kr·mi·mj · d / dist²  (magnitude ∝ 1/dist).
  for (int j = 0; j < MAX_NODES; j++) {
    float jf = float(j);
    if (jf >= uCount) break;
    if (jf == self) continue;
    vec2 ouv = indexToUV(jf, uTexSize);
    vec2 other = texture2D(texturePosition, ouv).xy;
    float mj = texture2D(uLinkRange, ouv).g + 1.0;
    vec2 d = pos - other;
    float dist2 = dot(d, d) + 1.0;
    F += uScalingRatio * mass * mj * d / dist2;
  }

  // Linear gravity toward the origin: magnitude mass·gravity.
  float plen = sqrt(dot(pos, pos)) + 1e-4;
  F -= uGravity * mass * pos / plen;

  // Linear attraction (cuGraph default, no rest length): coef·(neighbour − self).
  float offset = selfRange.r;
  float count = selfRange.g;
  for (int k = 0; k < MAX_LINKS; k++) {
    if (float(k) >= count) break;
    float ni = texture2D(uLinks, indexToUV(offset + float(k), uLinkTexSize)).r;
    vec2 np = texture2D(texturePosition, indexToUV(ni, uTexSize)).xy;
    F += uAttraction * (np - pos);
  }

  // Swinging / traction vs the previous tick's force (cuGraph local_speed_kernel).
  vec2 oldF = prevF.xy;
  float swing = mass * length(oldF - F);
  float traction = 0.5 * mass * length(oldF + F);
  gl_FragColor = vec4(F.x, F.y, swing, traction);
}
`;

const POSITION_SHADER = /* glsl */ `
uniform float uTexSize;
uniform float uCount;
uniform float uSpeed;
uniform float uDragIndex;
uniform vec2 uDragTarget;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  float self = floor(gl_FragCoord.y) * uTexSize + floor(gl_FragCoord.x);
  vec4 pos = texture2D(texturePosition, uv);
  if (self >= uCount) {
    gl_FragColor = pos;
    return;
  }
  // Cursor-pinned drag: forced position. Its real force still pulls neighbours.
  if (self == uDragIndex) {
    gl_FragColor = vec4(uDragTarget, 0.0, 1.0);
    return;
  }
  vec4 fd = texture2D(textureForce, uv);
  vec2 F = fd.xy;
  float swing = fd.z;
  // cuGraph update_positions_kernel: factor = speed / (1 + sqrt(speed·swinging)).
  float factor = uSpeed / (1.0 + sqrt(uSpeed * swing));
  gl_FragColor = vec4(pos.xy + F * factor, 0.0, 1.0);
}
`;

/** Edge as resolved node *indices* into the position texture. */
export interface SolverEdge {
  source: number;
  target: number;
}

/** Per-tick dynamics returned for the host's convergence/stop decision. */
export interface TickMetrics {
  meanDisplacement: number;
  totalSwinging: number;
  speed: number;
}

function makeDataTexture(size: number): DataTexture {
  const tex = new DataTexture(
    new Float32Array(size * size * 4),
    size,
    size,
    RGBAFormat,
    FloatType,
  );
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  return tex;
}

export class ForceSolver {
  readonly count: number;
  readonly texSize: number;

  private readonly gpu: GPUComputationRenderer;
  private readonly forceVar: Variable;
  private readonly positionVar: Variable;
  private readonly linkRangeTex: DataTexture;
  private readonly linksTex: DataTexture;
  private readonly forceBuf: Float32Array;

  private params: ForceParams;
  // Adaptive-speed state (cuGraph): speed and speed_efficiency persist across ticks.
  private speed = 1;
  private speedEfficiency = 1;

  constructor(
    renderer: WebGLRenderer,
    nodeCount: number,
    edges: SolverEdge[],
    params: ForceParams,
    seedRadius: number,
  ) {
    this.count = nodeCount;
    this.params = params;
    this.texSize = Math.max(2, Math.ceil(Math.sqrt(Math.max(1, nodeCount))));
    const texSize = this.texSize;
    this.forceBuf = new Float32Array(texSize * texSize * 4);

    // --- adjacency textures (undirected: each edge feeds both endpoints) ----
    const degree = new Array<number>(nodeCount).fill(0);
    for (const e of edges) {
      if (e.source < nodeCount && e.target < nodeCount && e.source !== e.target) {
        degree[e.source]++;
        degree[e.target]++;
      }
    }
    const offsets = new Array<number>(nodeCount).fill(0);
    let total = 0;
    for (let i = 0; i < nodeCount; i++) {
      offsets[i] = total;
      total += degree[i];
    }
    const linkTexSize = Math.max(2, Math.ceil(Math.sqrt(Math.max(1, total))));
    const flat = new Float32Array(linkTexSize * linkTexSize * 4);
    const cursor = offsets.slice();
    const writeNbr = (node: number, nbr: number) => {
      const slot = cursor[node]++;
      flat[slot * 4] = nbr;
    };
    for (const e of edges) {
      if (e.source < nodeCount && e.target < nodeCount && e.source !== e.target) {
        writeNbr(e.source, e.target);
        writeNbr(e.target, e.source);
      }
    }
    this.linksTex = makeDataTexture(linkTexSize);
    (this.linksTex.image.data as Float32Array).set(flat);
    this.linksTex.needsUpdate = true;

    this.linkRangeTex = makeDataTexture(texSize);
    const rangeData = this.linkRangeTex.image.data as Float32Array;
    for (let i = 0; i < nodeCount; i++) {
      rangeData[i * 4] = offsets[i]; // R = offset
      rangeData[i * 4 + 1] = degree[i]; // G = degree (mass = degree + 1)
    }
    this.linkRangeTex.needsUpdate = true;

    // --- GPGPU variables ----------------------------------------------------
    this.gpu = new GPUComputationRenderer(texSize, texSize, renderer);
    const posTex = this.gpu.createTexture();
    const forceTex = this.gpu.createTexture(); // zeros → old force starts at 0
    this.seedPositions(posTex.image.data as Float32Array, nodeCount, seedRadius);

    const defines = (src: string) =>
      src
        .replace(/MAX_NODES/g, String(texSize * texSize))
        .replace(/MAX_LINKS/g, String(linkTexSize * linkTexSize));

    this.forceVar = this.gpu.addVariable("textureForce", defines(FORCE_SHADER), forceTex);
    this.positionVar = this.gpu.addVariable(
      "texturePosition",
      defines(POSITION_SHADER),
      posTex,
    );
    this.gpu.setVariableDependencies(this.forceVar, [this.positionVar, this.forceVar]);
    this.gpu.setVariableDependencies(this.positionVar, [this.positionVar, this.forceVar]);

    const fu = this.forceVar.material.uniforms;
    fu.uTexSize = { value: texSize };
    fu.uCount = { value: nodeCount };
    fu.uLinkTexSize = { value: linkTexSize };
    fu.uScalingRatio = { value: params.scalingRatio };
    fu.uGravity = { value: params.gravity };
    fu.uAttraction = { value: params.attraction };
    fu.uLinkRange = { value: this.linkRangeTex };
    fu.uLinks = { value: this.linksTex };

    const pu = this.positionVar.material.uniforms;
    pu.uTexSize = { value: texSize };
    pu.uCount = { value: nodeCount };
    pu.uSpeed = { value: 1 };
    pu.uDragIndex = { value: -1 };
    pu.uDragTarget = { value: [0, 0] };

    const error = this.gpu.init();
    if (error) throw new Error(`ForceSolver GPGPU init failed: ${error}`);
  }

  private seedPositions(data: Float32Array, count: number, radius: number): void {
    // Deterministic golden-angle disc warm start (no RNG). FA2 attraction is linear
    // (no rest length), so the seed only needs to be non-degenerate; the layout
    // scale is set by the forces, not the seed.
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const r = radius * Math.sqrt((i + 0.5) / count);
      const a = i * golden;
      data[i * 4] = Math.cos(a) * r;
      data[i * 4 + 1] = Math.sin(a) * r;
      data[i * 4 + 2] = 0;
      data[i * 4 + 3] = 1;
    }
  }

  setParams(params: ForceParams): void {
    this.params = params;
    const fu = this.forceVar.material.uniforms;
    fu.uScalingRatio.value = params.scalingRatio;
    fu.uGravity.value = params.gravity;
    fu.uAttraction.value = params.attraction;
  }

  /** cuGraph adapt_speed: update global `speed` from total swinging `s` / traction `t`. */
  private adaptSpeed(s: number, t: number): void {
    const n = this.count;
    const jitterTolerance = this.params.jitterTolerance;
    const estimatedJt = 0.05 * Math.sqrt(n);
    const minJt = Math.sqrt(estimatedJt);
    const maxJt = 10;
    const minSpeedEfficiency = 0.05;
    const maxRise = 0.5;

    let jt =
      jitterTolerance * Math.max(minJt, Math.min(maxJt, (estimatedJt * t) / (n * n)));

    if (t > 0 && s / t > 2.0) {
      if (this.speedEfficiency > minSpeedEfficiency) this.speedEfficiency *= 0.5;
      jt = Math.max(jt, jitterTolerance);
    }

    const targetSpeed =
      s === 0 ? Number.MAX_VALUE : (jt * this.speedEfficiency * t) / s;

    if (s > jt * t) {
      if (this.speedEfficiency > minSpeedEfficiency) this.speedEfficiency *= 0.7;
    } else if (this.speed < 1000) {
      this.speedEfficiency *= 1.3;
    }

    this.speed = this.speed + Math.min(targetSpeed - this.speed, maxRise * this.speed);
  }

  /**
   * Advance one ForceAtlas2 iteration: force pass → CPU reduction of
   * swinging/traction → adaptive speed → position pass. Returns the tick's mean
   * per-node displacement (→0 at true convergence), total swinging, and speed.
   */
  tick(renderer: WebGLRenderer): TickMetrics {
    const appliedSpeed = this.speed; // the position pass uses last tick's speed
    this.positionVar.material.uniforms.uSpeed.value = appliedSpeed;
    this.gpu.compute();

    // Reduce this tick's forces for the global speed update + a convergence metric.
    const rt = this.gpu.getCurrentRenderTarget(this.forceVar);
    renderer.readRenderTargetPixels(rt, 0, 0, this.texSize, this.texSize, this.forceBuf);
    let s = 0;
    let t = 0;
    let disp = 0;
    for (let i = 0; i < this.count; i++) {
      const fx = this.forceBuf[i * 4];
      const fy = this.forceBuf[i * 4 + 1];
      const sw = this.forceBuf[i * 4 + 2];
      const tr = this.forceBuf[i * 4 + 3];
      if (Number.isFinite(sw)) s += sw;
      if (Number.isFinite(tr)) t += tr;
      const flen = Math.hypot(fx, fy);
      const factor = appliedSpeed / (1 + Math.sqrt(Math.max(0, appliedSpeed * sw)));
      if (Number.isFinite(flen)) disp += flen * factor;
    }
    this.adaptSpeed(s, t);
    return {
      meanDisplacement: this.count > 0 ? disp / this.count : 0,
      totalSwinging: s,
      speed: this.speed,
    };
  }

  setDrag(index: number, x: number, y: number): void {
    this.positionVar.material.uniforms.uDragIndex.value = index;
    this.positionVar.material.uniforms.uDragTarget.value = [x, y];
  }

  clearDrag(): void {
    this.positionVar.material.uniforms.uDragIndex.value = -1;
  }

  get positionTexture(): Texture {
    return this.gpu.getCurrentRenderTarget(this.positionVar).texture;
  }

  /** Read positions back to the CPU as packed (x, y, _, _) per texel. GPU stall. */
  readPositions(renderer: WebGLRenderer, out: Float32Array): void {
    const rt = this.gpu.getCurrentRenderTarget(this.positionVar);
    renderer.readRenderTargetPixels(rt, 0, 0, this.texSize, this.texSize, out);
  }

  dispose(): void {
    this.gpu.dispose();
    this.linkRangeTex.dispose();
    this.linksTex.dispose();
  }
}
