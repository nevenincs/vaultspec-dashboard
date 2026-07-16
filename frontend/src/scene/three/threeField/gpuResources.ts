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
  RGBAFormat,
  ShaderMaterial,
  Uint32BufferAttribute,
  WebGLRenderer,
  type Texture,
} from "three";
import { type SceneEdgeData, type SceneNodeData } from "../../sceneController";
import {
  canvasBackground,
  edgeAppearance,
  edgeEndColors,
  inkColor,
  inkMutedColor,
  nodeColorNumber,
  nodeWorldRadius,
} from "../appearance";
import { uiScale } from "../uiScale";
import { buildGlyphAtlas, glyphKeyForNode } from "../glyphAtlas";
import { MAX_GL_RESTORE_ATTEMPTS } from "./config";
import {
  EDGE_FRAGMENT,
  EDGE_VERTEX,
  GLYPH_FRAGMENT,
  GLYPH_VERTEX,
  NODE_FRAGMENT,
  NODE_VERTEX,
} from "./shaders";
import { ThreeFieldState } from "./state";
export abstract class ThreeFieldGpuResources extends ThreeFieldState {
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

    (window as unknown as { __threeField?: ThreeFieldState }).__threeField = this;
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

  protected applyBackground(): void {
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
    const g = window as unknown as { __threeField?: ThreeFieldState };
    if (g.__threeField === this) delete g.__threeField;
  }

  // --- WebGL context-loss resilience (scene-WebGL hardening) ----------------

  /** WebGL context lost (GPU crash / driver reset / tab backgrounding): preventDefault is
   *  REQUIRED or the browser never fires a restore. Pause the loop + report; the CPU
   *  d3-force layout (cpuPositions/solver) is untouched and persists for the rebuild. */
  protected onContextLost = (e: Event): void => {
    e.preventDefault();
    this.setRunning(false);
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
  protected onContextRestored = (): void => {
    try {
      this.rebuildGLResources();
      this.glRestoreAttempts = 0;
      this.controller?.emit({
        kind: "render-capability",
        state: "ok",
        recoverable: true,
      });
      // Resume ticking only when there is genuinely unfinished settling (GPR-004):
      // a restore over a SETTLED graph otherwise emitted a spurious sim-state
      // true→false flicker, ran a ghost tick over fully-pinned nodes, and re-wrote
      // the persisted layout blob for nothing. The repaint alone suffices there.
      this.setRunning(this.solver !== null && !this.frozen && !this.solver.isSettled());
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
  protected rebuildGLResources(): void {
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

  protected buildNodes(nodes: SceneNodeData[], texSize: number): void {
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
      const col = nodeColorNumber(node, this.appearance);
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
    // token, theme-adaptive): a non-focus node mixes toward it (the eased aDim recede) so it
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
  protected iconInk(which: "light" | "dark"): [number, number, number] {
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
  protected buildGlyphs(
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

  protected buildEdges(
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

  protected disposeGraph(): void {
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
    this.simPositions = new Float32Array(0);
    this.displayEasing = false;
    // SGR-005: the node set + positions just changed, so any cached pick is stale
    // — invalidate synchronously (a pick can run before the next frame clears it).
    this.pickCacheValid = false;
  }

  /** Tear down the glyph mesh + material (the cached atlas texture survives, reused on
   *  the next build; it is only disposed on destroy or a GL context loss). */
  protected disposeGlyphs(): void {
    if (this.glyphMesh) {
      this.scene.remove(this.glyphMesh);
      this.glyphMesh.geometry.dispose();
      this.glyphMesh = null;
    }
    this.glyphMaterial?.dispose();
    this.glyphMaterial = null;
  }
}
