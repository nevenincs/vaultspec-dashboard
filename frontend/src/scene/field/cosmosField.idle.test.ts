// @vitest-environment jsdom
//
// Render-on-demand idle (node-graph-rework norm: idle GPU = 0). cosmos's frame
// loop renders every frame forever once started; CosmosField halts it (stopFrames)
// when the sim has settled AND the pointer is off the canvas, and wakes it
// (render) on pointer activity, interaction, and sim (re)starts. start()/pause()/
// unpause() only flip the sim flag — they never touch the loop — so this test
// mocks the cosmos Graph to assert the loop is started/stopped at the right times.

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

describe("CosmosField render-on-demand idle", () => {
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

  it("runs the frame loop while simulating and idles it after settle + pointer away", async () => {
    field.command({ kind: "set-simulation-active", active: true });
    field.command({ kind: "set-data", ...smallGraph() });
    // Loop is alive while the sim runs.
    expect(graph.requestAnimationFrameId).not.toBe(0);

    // The sim settles; cosmos fires onSimulationEnd, which schedules the idle check.
    graph.fireSimulationEnd();
    await settle();

    // Pointer is off the canvas -> the GPU loop is halted (idle = 0).
    expect(graph.requestAnimationFrameId).toBe(0);
  });

  it("keeps the loop alive while the pointer is over the canvas (hover needs frames)", async () => {
    field.command({ kind: "set-simulation-active", active: true });
    field.command({ kind: "set-data", ...smallGraph() });
    container.dispatchEvent(new Event("pointerenter"));
    graph.fireSimulationEnd();
    await settle();
    // Pointer present -> the loop must NOT idle, or cosmos hover detection dies.
    expect(graph.requestAnimationFrameId).not.toBe(0);
  });

  it("wakes the idled loop on pointer enter", async () => {
    field.command({ kind: "set-simulation-active", active: true });
    field.command({ kind: "set-data", ...smallGraph() });
    graph.fireSimulationEnd();
    await settle();
    expect(graph.requestAnimationFrameId).toBe(0); // idled

    container.dispatchEvent(new Event("pointerenter"));
    expect(graph.requestAnimationFrameId).not.toBe(0); // woken
  });

  it("wakes the idled loop on a fit-to-view command", async () => {
    field.command({ kind: "set-simulation-active", active: true });
    field.command({ kind: "set-data", ...smallGraph() });
    graph.fireSimulationEnd();
    await settle();
    expect(graph.requestAnimationFrameId).toBe(0);

    field.command({ kind: "fit-to-view" });
    expect(graph.requestAnimationFrameId).not.toBe(0);
  });
});
