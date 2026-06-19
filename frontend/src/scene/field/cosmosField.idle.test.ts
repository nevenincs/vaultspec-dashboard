// @vitest-environment jsdom
//
// Continuous-while-data render model (graph-perf 2026-06-18). Render-on-demand
// idle (stopFrames after settle) FROZE the canvas mid-interaction: panning the
// background changed the transform but no frame painted. The field now keeps
// Cosmos' frame loop ALIVE while there is data — continuous 60fps so pan/zoom/drag
// all render — and idles the GPU only when the field is EMPTY (no points to draw).
// The simulation still cools and stops ticking (settle-and-stop decay), so a
// settled-but-alive loop is cheap draw-only frames, not a hot n-body loop. This
// test mocks the cosmos Graph to assert the loop is alive/idled at the right times.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The idle debounce uses window.setTimeout; use real timers and await a margin
// rather than fake timers, which do not reliably patch window.setTimeout under
// jsdom. The first data load also arms a one-time opening auto-fit (~120ms) that
// re-schedules idle at 600ms, so the wait must clear ~720ms. The full frontend
// suite runs many live-engine tests in parallel; use a wider real-time margin so
// this remains a behavior check rather than a scheduler-load check.
const settle = () => new Promise((r) => setTimeout(r, 1600));

class MockGraph {
  config: Record<string, unknown>;
  requestAnimationFrameId = 0;
  isSimulationRunning = false;
  store = { alpha: 0, isSimulationRunning: false };
  pointsNumber = 0;
  constructor(_div: HTMLElement, config: Record<string, unknown>) {
    this.config = config;
  }
  // render() is the ONLY thing that (re)starts the perpetual frame loop.
  render(): void {
    this.requestAnimationFrameId = 1;
  }
  // stopFrames() (private in cosmos) is the ONLY public-reachable way to idle it.
  stopFrames(): void {
    this.requestAnimationFrameId = 0;
  }
  start(): void {
    this.isSimulationRunning = true;
    this.store.isSimulationRunning = true;
  }
  pause(): void {
    this.isSimulationRunning = false;
    this.store.isSimulationRunning = false;
  }
  unpause(): void {
    this.isSimulationRunning = true;
    this.store.isSimulationRunning = true;
  }
  stop(): void {
    this.isSimulationRunning = false;
    this.store.isSimulationRunning = false;
  }
  /** Drive the settle callback the way cosmos does when alpha < ALPHA_MIN. */
  fireSimulationEnd(): void {
    this.isSimulationRunning = false;
    this.store.isSimulationRunning = false;
    (this.config.onSimulationEnd as (() => void) | undefined)?.();
  }
  setConfig(): void {}
  setPointPositions(): void {}
  setPointColors(): void {}
  setPointSizes(): void {}
  setLinks(): void {}
  setLinkColors(): void {}
  setLinkWidths(): void {}
  getPointPositions(): number[] {
    return [];
  }
  fitView(): void {}
  fitViewByPointPositions(): void {}
  setZoomLevel(): void {}
  getZoomLevel(): number {
    return 1;
  }
  zoomToPointByIndex(): void {}
  selectPointsByIndices(): void {}
  unselectPoints(): void {}
  setPinnedPoints(): void {}
  destroy(): void {}
}

vi.mock("@cosmos.gl/graph", () => ({ Graph: MockGraph }));

// Import AFTER the mock is registered.
const { CosmosField } = await import("./cosmosField");

function smallGraph(n = 8) {
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    kind: "document" as const,
  }));
  const edges = Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    src: `n${i}`,
    dst: `n${(i + 1) % n}`,
    relation: "implements",
    tier: "declared" as const,
    confidence: 1,
  }));
  return { nodes, edges };
}

describe("CosmosField continuous-while-data render loop", () => {
  let host: HTMLDivElement;
  let container: HTMLElement;
  let field: InstanceType<typeof CosmosField>;
  let graph: MockGraph;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    field = new CosmosField();
    field.mount(host);
    graph = (field as unknown as { graph: MockGraph }).graph;
    // The pointer listeners live on the inner canvas container, not the host.
    container = (field as unknown as { container: HTMLElement }).container;
    // Skip the RAF warmup so a sim start happens synchronously in the test.
    (field as unknown as { rendererPrimed: boolean }).rendererPrimed = true;
  });

  afterEach(() => {
    field.destroy();
    host.remove();
    vi.restoreAllMocks();
  });

  it("keeps the loop alive after settle while data is present (continuous render)", async () => {
    field.command({ kind: "set-simulation-active", active: true });
    field.command({ kind: "set-data", ...smallGraph() });
    // Loop is alive while the sim runs.
    expect(graph.requestAnimationFrameId).not.toBe(0);

    // The sim settles; cosmos fires onSimulationEnd, which schedules the idle check.
    graph.fireSimulationEnd();
    await settle();

    // Data is present, so the loop STAYS alive (cheap draw-only frames) — pan/zoom/
    // drag must keep rendering. Render-on-demand idle here froze the canvas.
    expect(graph.requestAnimationFrameId).not.toBe(0);
  });

  it("keeps the loop alive regardless of pointer position", async () => {
    field.command({ kind: "set-simulation-active", active: true });
    field.command({ kind: "set-data", ...smallGraph() });
    container.dispatchEvent(new Event("pointerenter"));
    graph.fireSimulationEnd();
    await settle();
    expect(graph.requestAnimationFrameId).not.toBe(0);
    container.dispatchEvent(new Event("pointerleave"));
    await settle();
    // Pointer leaving does NOT idle a non-empty field — the canvas must stay live.
    expect(graph.requestAnimationFrameId).not.toBe(0);
  });

  it("idles the GPU loop only when the field is emptied", async () => {
    field.command({ kind: "set-simulation-active", active: true });
    field.command({ kind: "set-data", ...smallGraph() });
    graph.fireSimulationEnd();
    await settle();
    expect(graph.requestAnimationFrameId).not.toBe(0); // alive with data

    // Empty the field -> no points to draw -> the GPU loop idles to zero.
    field.command({ kind: "set-data", nodes: [], edges: [] });
    await settle();
    expect(graph.requestAnimationFrameId).toBe(0);
  });

  it("restarts the loop when data is re-loaded after empty", async () => {
    field.command({ kind: "set-simulation-active", active: true });
    field.command({ kind: "set-data", nodes: [], edges: [] });
    await settle();
    expect(graph.requestAnimationFrameId).toBe(0); // idled (empty)

    field.command({ kind: "set-data", ...smallGraph() });
    expect(graph.requestAnimationFrameId).not.toBe(0); // data -> loop alive
  });
});
