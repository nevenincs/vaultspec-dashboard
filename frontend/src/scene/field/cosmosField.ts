// cosmos.gl-backed scene field — the LIVE, continuous, GPU force simulation
// (graph-cosmos-migration). Replaces the custom main-thread d3-force driver +
// PixiJS render-on-demand field, both of which never reached a stable continuous
// simulation and were masked with pauses/snapshots. cosmos.gl runs the force sim
// AND the rendering on the GPU, so it is live and interactive by construction.
//
// BUILT BRICK BY BRICK so each layer can be verified in isolation (there were too
// many overlapping failures to debug at once):
//   - BRICK 1 (this commit): ALL FORCES OFF. Nodes are placed on a static
//     phyllotaxis spiral whose nearest-neighbour spacing exceeds the largest node
//     diameter, so nodes CANNOT intersect. Colour = document category, size =
//     salience radius, links wired. Drag / zoom / hover / click are live. This
//     proves the cosmos render + interaction layer is stable with no force in play.
//   - later bricks enable repulsion, then size-aware non-overlap, then links, then
//     gravity — one force at a time, each verified live.
//
// Implements the frozen SceneFieldRenderer seam (mount/resize/destroy/command);
// the SceneController, every chrome surface, and the wire shape are unchanged.

import { Graph } from "@cosmos.gl/graph";

import type {
  SceneCommand,
  SceneController,
  SceneEdgeData,
  SceneFieldRenderer,
  SceneNodeData,
} from "../sceneController";
import { categoryColor } from "./categoryColor";
import { nodeRadius } from "./nodeSprites";
import { cssColorNumber } from "./tokenReads";

/** cosmos simulation space (world units); positions live in [0, SPACE_SIZE]. */
const SPACE_SIZE = 4096;
/**
 * BRICK 1 static placement: phyllotaxis (sunflower) nearest-neighbour spacing.
 * Set comfortably above the largest node diameter (salience radius tops out near
 * ~34px → ~68px diameter) so no two nodes ever intersect in the forces-off field.
 */
const STATIC_SPACING = 110;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Hex int (0xRRGGBB) → cosmos [r,g,b,a] floats in [0,1]. */
function rgba(hex: number): [number, number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, 1];
}

/** Scene token (literal hex int) → "#rrggbb" string for cosmos string colours. */
function hexString(varName: string, fallback: number): string {
  return `#${cssColorNumber(varName, fallback).toString(16).padStart(6, "0")}`;
}

export class CosmosField implements SceneFieldRenderer {
  private graph: Graph | null = null;
  private container: HTMLDivElement | null = null;
  /** Stable id ↔ cosmos point-index mapping (cosmos addresses points by index). */
  private idToIndex = new Map<string, number>();
  private indexToId: string[] = [];
  /** Set by createDashboardScene; seam events (select/hover) flow back through it. */
  controller: SceneController | null = null;

  mount(host: HTMLElement): void {
    if (typeof document === "undefined") return; // SSR / node test env
    if (this.graph) return; // idempotent
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.inset = "0";
    container.style.width = "100%";
    container.style.height = "100%";
    host.appendChild(container);
    this.container = container;

    this.graph = new Graph(container, {
      backgroundColor: hexString("--color-canvas-bg", 0xfdfaf6),
      spaceSize: SPACE_SIZE,
      // ---- force balance (cosmos GPU sim — the LIVE layout) ---------------
      // NO gravity: it pulls every node to the centre and collapses a dense graph
      // into a clump that repulsion cannot hold open (measured: bbox ~285 WITH
      // gravity vs ~1300 without). Repulsion spreads the field; a MODERATE link
      // spring with a link distance well above the node sizes clusters connected
      // nodes without stacking them; friction < 1 cools to a stable rest and a
      // drag reheats it. (These are the knobs the Tune sliders will drive.)
      // Repulsion ONLY for now: it provably yields a spread, NON-overlapping field
      // (Brick 2 measured min node spacing 117). The link *force* is OFF (links are
      // still RENDERED as the grey mesh) because on this graph's high-degree hubs the
      // spring crowds every neighbour onto one shell faster than repulsion separates
      // them — clumping the field into overlapping blobs. Link-driven clustering and
      // the live drag dynamics are the deferred simulation tuning.
      simulationRepulsion: 2.0,
      simulationGravity: 0,
      simulationLinkSpring: 0,
      simulationLinkDistance: 120,
      simulationFriction: 0.85,
      simulationDecay: 2000,
      // ---- interaction (live) ---------------------------------------------
      enableDrag: true,
      fitViewOnInit: true,
      fitViewPadding: 0.25,
      // Node sizes are WORLD-relative (scale with the layout/zoom). This is what
      // keeps nodes non-overlapping: a fixed PIXEL size piles big dots on top of
      // each other when the spread field is zoomed out to fit a small canvas, even
      // though the node centres are well separated in world space.
      scalePointsOnZoom: true,
      pointSizeScale: 2,
      renderHoveredPointRing: true,
      hoveredPointRingColor: hexString("--color-accent", 0x8a7d5a),
      // ---- edges: the binding flat-grey connection mesh, plus the focus ring -
      linkColor: hexString("--color-scene-rule", 0xd8d2ca),
      linkWidth: 1,
      linkArrows: false,
      renderLinks: true,
      focusedPointRingColor: hexString("--color-accent", 0x8a7d5a),
      onClick: (index) => {
        const id = index === undefined ? null : (this.indexToId[index] ?? null);
        this.controller?.emit({ kind: "select", id });
      },
      onPointMouseOver: (index) => {
        this.controller?.emit({ kind: "hover", id: this.indexToId[index] ?? null });
      },
      onPointMouseOut: () => {
        this.controller?.emit({ kind: "hover", id: null });
      },
    });
  }

  command(cmd: SceneCommand): void {
    if (!this.graph) return;
    switch (cmd.kind) {
      case "set-data":
        this.setData(cmd.nodes, cmd.edges);
        break;
      case "set-selected":
        this.setSelected(cmd.ids);
        break;
      case "focus-node": {
        const i = this.idToIndex.get(cmd.id);
        if (i !== undefined) this.graph.zoomToPointByIndex(i);
        break;
      }
      case "zoom-in":
        this.graph.setZoomLevel(this.graph.getZoomLevel() * 1.25, 250);
        break;
      case "zoom-out":
        this.graph.setZoomLevel(this.graph.getZoomLevel() / 1.25, 250);
        break;
      case "fit-to-view":
      case "reset-view":
        this.graph.fitView(400);
        break;
      // visibility, pins, representation mode, time, overlays, deltas land next.
    }
  }

  /** The shared selection (set-selected): ring the first selected node present in
   *  the current slice. cosmos's focused-point ring is the on-canvas selection. */
  private setSelected(ids: ReadonlySet<string>): void {
    if (!this.graph) return;
    let focused: number | undefined;
    for (const id of ids) {
      const i = this.idToIndex.get(id);
      if (i !== undefined) {
        focused = i;
        break;
      }
    }
    this.graph.setConfig({ focusedPointIndex: focused });
  }

  private setData(
    nodes: readonly SceneNodeData[],
    edges: readonly SceneEdgeData[],
  ): void {
    if (!this.graph) return;
    this.idToIndex.clear();
    this.indexToId = new Array(nodes.length);
    const count = nodes.length;
    const positions = new Float32Array(count * 2);
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 4);
    const centre = SPACE_SIZE / 2;

    nodes.forEach((node, i) => {
      this.idToIndex.set(node.id, i);
      this.indexToId[i] = node.id;
      sizes[i] = nodeRadius(node) * 2; // world-relative size; scales with zoom
      // Category fill from the vault DOC TYPE first (adr/plan/exec/…), falling
      // back to the generic node species (`kind`) for nodes with no doc type
      // (feature / plan-container / code-artifact). The wire `kind` alone is the
      // species, not the category, so colouring by it collapsed ~all document
      // and plan-container nodes onto the single `code` swatch.
      const [r, g, b, a] = rgba(categoryColor(node.docType ?? node.kind));
      colors[i * 4] = r;
      colors[i * 4 + 1] = g;
      colors[i * 4 + 2] = b;
      colors[i * 4 + 3] = a;
      // Phyllotaxis spiral: r = c·√i, θ = i·goldenAngle → even, non-overlapping.
      const radius = STATIC_SPACING * Math.sqrt(i);
      const angle = i * GOLDEN_ANGLE;
      positions[i * 2] = centre + Math.cos(angle) * radius;
      positions[i * 2 + 1] = centre + Math.sin(angle) * radius;
    });

    const linkList: number[] = [];
    for (const e of edges) {
      const s = this.idToIndex.get(e.src);
      const t = this.idToIndex.get(e.dst);
      if (s !== undefined && t !== undefined) linkList.push(s, t);
    }

    this.graph.setPointPositions(positions);
    this.graph.setPointColors(colors);
    this.graph.setPointSizes(sizes);
    this.graph.setLinks(new Float32Array(linkList));
    // Commit the freshly-set point/link buffers with a draw BEFORE starting the
    // simulation — cosmos needs the points uploaded before start() takes them over
    // (otherwise start() runs against an empty buffer and the field renders blank).
    this.graph.render();
    // BRICK 2: start the LIVE force simulation. cosmos runs it on the GPU — the
    // field spreads and cools to a stable rest, and reheats on drag. (This is a
    // real continuous sim, not the paused snapshot the old field faked.)
    this.graph.start();
  }

  resize(): void {
    // cosmos observes the container element's size and re-renders on its own.
  }

  destroy(): void {
    this.graph?.destroy();
    this.graph = null;
    this.container?.remove();
    this.container = null;
    this.idToIndex.clear();
    this.indexToId = [];
  }

  /** Warm-start persistence lands in a later brick; no-op for now. */
  setPersistenceScope(_workspace: string, _scope: string): void {
    void _workspace;
    void _scope;
  }

  /** Dev/test inspection for NON-tautological verification: the live cosmos point
   *  positions (is it real? do nodes overlap? is it moving when a force is on?). */
  debugSnapshot(): {
    pointCount: number;
    points: { id: string; x: number; y: number }[];
  } {
    const flat = this.graph?.getPointPositions() ?? [];
    const points: { id: string; x: number; y: number }[] = [];
    for (let i = 0; i < flat.length / 2; i++) {
      points.push({
        id: this.indexToId[i] ?? String(i),
        x: flat[i * 2],
        y: flat[i * 2 + 1],
      });
    }
    return { pointCount: points.length, points };
  }
}
