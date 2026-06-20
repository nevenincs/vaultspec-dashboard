// Live graph performance gate.
//
// This test measures the actual graph lab surface at `/graph.html`, not the
// retired spike entrypoint. It drives the real SceneController/CosmosField stack
// in Chromium, first with the checked-in 11-node corpus and then with a bounded
// synthetic 1000-node / 5000-edge slice loaded through the graph lab's public dev
// loader. The gate checks page frame cadence, cold hover activation, synchronous
// hover/click latency, and the renderer idle invariant that keeps Cosmos' own rAF
// loop off between paints.

import { expect, test, type Page } from "@playwright/test";

import type { SceneEdgeData, SceneNodeData } from "../src/scene/sceneController";

interface GraphDebugSnapshot {
  pointCount: number;
  hoveredId: string | null;
  rendererLifecycle: string;
  simulationState: { active: boolean; running: boolean; alpha: number } | null;
  representationMode: { staticLayout: boolean };
}

interface GraphFieldProbe {
  debugSnapshot(): GraphDebugSnapshot;
  graph?: {
    requestAnimationFrameId?: number;
    zoomInstance?: {
      convertSpaceToScreenPosition?: (position: [number, number]) => [number, number];
    };
  };
  container?: HTMLElement;
  indexToId?: string[];
  lastPositions?: ArrayLike<number>;
}

interface GraphLabProbe {
  field: GraphFieldProbe;
  controller: {
    command(command: Record<string, unknown>): void;
    on(listener: (event: { kind: string; id?: string | null }) => void): () => void;
  };
}

interface FrameSummary {
  frames: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  fps: number;
  missedFrameRatio: number;
}

interface LatencySummary {
  samples: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

interface HoverActivationSummary {
  targetId: string;
  dispatchMs: number;
  frameMs: number;
  hoveredId: string | null;
}

declare global {
  interface Window {
    __graphLabScene?: GraphLabProbe;
    __graphLabLoadDevSlice?: (raw: unknown, label: string) => void;
  }
}

const GRAPH_URL = "/graph.html?theme=light";
const LOAD_TIMEOUT_MS = 30_000;
const FRAME_MEASURE_MS = 1_500;
const SURFACE_ITERATIONS = 80;
const LARGE_NODE_COUNT = 1_000;
const LARGE_EDGE_COUNT = 5_000;

const FRAME_AVG_BUDGET_MS = 19;
const FRAME_P95_BUDGET_MS = 35;
const MISSED_FRAME_RATIO_BUDGET = 0.08;
const SMALL_SURFACE_P95_BUDGET_MS = 1;
const LARGE_SURFACE_P95_BUDGET_MS = 4;
const SMALL_COLD_HOVER_FRAME_BUDGET_MS = 35;
const LARGE_COLD_HOVER_FRAME_BUDGET_MS = 120;

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[index] ?? 0;
}

function summarize(samples: readonly number[]): FrameSummary {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((sum, value) => sum + value, 0);
  const avgMs = samples.length === 0 ? 0 : total / samples.length;
  return {
    frames: samples.length,
    avgMs,
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted.at(-1) ?? 0,
    fps: avgMs > 0 ? 1000 / avgMs : 0,
    missedFrameRatio:
      samples.length === 0
        ? 1
        : samples.filter((sample) => sample > 25).length / samples.length,
  };
}

function summarizeLatency(samples: readonly number[]): LatencySummary {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    samples: samples.length,
    avgMs: samples.length === 0 ? 0 : total / samples.length,
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted.at(-1) ?? 0,
  };
}

function buildSyntheticSceneGraph(
  nodeCount: number,
  edgeCount: number,
): { nodes: SceneNodeData[]; edges: SceneEdgeData[] } {
  const docTypes = ["research", "adr", "plan", "exec", "audit", "reference"];
  const tiers: SceneEdgeData["tier"][] = [
    "declared",
    "structural",
    "temporal",
    "semantic",
  ];
  const nodes: SceneNodeData[] = Array.from({ length: nodeCount }, (_, index) => ({
    id: `doc:perf-${index}`,
    kind: "document",
    docType: docTypes[index % docTypes.length],
    title: `Performance document ${index}`,
    featureTags: [`feature-${index % 24}`],
    salience: (index % 100) / 100,
  }));
  const edges: SceneEdgeData[] = Array.from({ length: edgeCount }, (_, index) => {
    const src = index % nodeCount;
    const dst = (index * 17 + 31) % nodeCount;
    return {
      id: `edge:perf-${index}`,
      src: `doc:perf-${src}`,
      dst: `doc:perf-${dst === src ? (dst + 1) % nodeCount : dst}`,
      relation: index % 3 === 0 ? "references" : "touches",
      tier: tiers[index % tiers.length],
      confidence: 0.55 + (index % 45) / 100,
      state: index % 53 === 0 ? "stale" : "resolved",
    };
  });
  return { nodes, edges };
}

async function waitForGraph(page: Page, pointCount: number): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const debug = window.__graphLabScene?.field.debugSnapshot();
      return (
        debug?.pointCount === expected &&
        !debug.representationMode.staticLayout &&
        (debug.rendererLifecycle === "simulating" ||
          debug.rendererLifecycle === "ready")
      );
    },
    pointCount,
    { timeout: LOAD_TIMEOUT_MS },
  );
}

async function waitForSimulationRunning(page: Page, pointCount: number): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate((expected) => {
          const scene = window.__graphLabScene;
          const debug = scene?.field.debugSnapshot();
          return {
            pointCount: debug?.pointCount ?? 0,
            staticLayout: debug?.representationMode.staticLayout ?? true,
            active: debug?.simulationState?.active ?? false,
            running: debug?.simulationState?.running ?? false,
            raf: scene?.field.graph?.requestAnimationFrameId ?? 0,
            expected,
          };
        }, pointCount),
      { timeout: 4_000 },
    )
    .toEqual({
      pointCount,
      staticLayout: false,
      active: true,
      running: true,
      raf: expect.any(Number),
      expected: pointCount,
    });
  const raf = await page.evaluate(
    () => window.__graphLabScene?.field.graph?.requestAnimationFrameId ?? 0,
  );
  expect(raf, "simulation must own an active Cosmos frame loop").toBeGreaterThan(0);
}

async function measureFrames(page: Page, interact: boolean): Promise<FrameSummary> {
  const samples = await page.evaluate(
    async ({ durationMs, shouldInteract }) => {
      function resolveTargetInPage(field: GraphFieldProbe): {
        id: string;
        clientX: number;
        clientY: number;
      } | null {
        const container = field.container;
        const positions = field.lastPositions;
        const ids = field.indexToId;
        const zoom = field.graph?.zoomInstance;
        const toScreen = zoom?.convertSpaceToScreenPosition;
        if (
          !container ||
          !positions ||
          !ids ||
          !zoom ||
          typeof toScreen !== "function"
        ) {
          return null;
        }
        const rect = container.getBoundingClientRect();
        for (let i = 0; i < ids.length; i += 1) {
          const id = ids[i];
          const x = positions[i * 2];
          const y = positions[i * 2 + 1];
          if (!id || x === undefined || y === undefined) continue;
          const screen = toScreen.call(zoom, [x, y]);
          return {
            id,
            clientX: rect.left + screen[0],
            clientY: rect.top + screen[1],
          };
        }
        return null;
      }
      function dispatchPointerMoveInPage(
        container: HTMLElement,
        clientX: number,
        clientY: number,
      ): void {
        container.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
            pointerType: "mouse",
          }),
        );
      }
      const scene = window.__graphLabScene;
      if (!scene) throw new Error("graph lab scene is not exposed");
      const field = scene.field;
      const container = field.container;
      if (!container) throw new Error("graph field container is not mounted");
      const target = resolveTargetInPage(field);
      const samplesOut: number[] = [];
      await new Promise<void>((resolve) => {
        const endAt = performance.now() + durationMs;
        let last = performance.now();
        let toggle = false;
        const step = (now: number) => {
          samplesOut.push(now - last);
          last = now;
          if (shouldInteract && target) {
            toggle = !toggle;
            dispatchPointerMoveInPage(
              container,
              target.clientX + (toggle ? 1 : -1),
              target.clientY + (toggle ? 1 : -1),
            );
          }
          if (now >= endAt) {
            resolve();
          } else {
            window.requestAnimationFrame(step);
          }
        };
        window.requestAnimationFrame(step);
      });
      return samplesOut;
    },
    { durationMs: FRAME_MEASURE_MS, shouldInteract: interact },
  );
  return summarize(samples);
}

async function measureColdHoverActivation(page: Page): Promise<HoverActivationSummary> {
  return page.evaluate(async () => {
    function resolveTargetInPage(field: GraphFieldProbe): {
      id: string;
      clientX: number;
      clientY: number;
    } | null {
      const container = field.container;
      const positions = field.lastPositions;
      const ids = field.indexToId;
      const zoom = field.graph?.zoomInstance;
      const toScreen = zoom?.convertSpaceToScreenPosition;
      if (!container || !positions || !ids || !zoom || typeof toScreen !== "function") {
        return null;
      }
      const rect = container.getBoundingClientRect();
      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i];
        const x = positions[i * 2];
        const y = positions[i * 2 + 1];
        if (!id || x === undefined || y === undefined) continue;
        const screen = toScreen.call(zoom, [x, y]);
        return {
          id,
          clientX: rect.left + screen[0],
          clientY: rect.top + screen[1],
        };
      }
      return null;
    }
    function dispatchPointerMoveInPage(
      container: HTMLElement,
      clientX: number,
      clientY: number,
    ): void {
      container.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          pointerType: "mouse",
        }),
      );
    }

    const scene = window.__graphLabScene;
    if (!scene) throw new Error("graph lab scene is not exposed");
    const field = scene.field;
    const container = field.container;
    if (!container) throw new Error("graph field container is not mounted");
    const target = resolveTargetInPage(field);
    if (!target) throw new Error("no pickable target found");

    return new Promise<HoverActivationSummary>((resolve) => {
      window.requestAnimationFrame((startFrame) => {
        const startDispatch = performance.now();
        dispatchPointerMoveInPage(container, target.clientX, target.clientY);
        const dispatchMs = performance.now() - startDispatch;
        window.requestAnimationFrame((nextFrame) => {
          resolve({
            targetId: target.id,
            dispatchMs,
            frameMs: nextFrame - startFrame,
            hoveredId: field.debugSnapshot().hoveredId,
          });
        });
      });
    });
  });
}

async function measureSurfaceLatency(page: Page): Promise<{
  pointCount: number;
  targetId: string;
  hover: LatencySummary;
  click: LatencySummary;
  errors: string[];
}> {
  const result = await page.evaluate((iterations) => {
    function resolveTargetInPage(field: GraphFieldProbe): {
      id: string;
      clientX: number;
      clientY: number;
    } | null {
      const container = field.container;
      const positions = field.lastPositions;
      const ids = field.indexToId;
      const zoom = field.graph?.zoomInstance;
      const toScreen = zoom?.convertSpaceToScreenPosition;
      if (!container || !positions || !ids || !zoom || typeof toScreen !== "function") {
        return null;
      }
      const rect = container.getBoundingClientRect();
      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i];
        const x = positions[i * 2];
        const y = positions[i * 2 + 1];
        if (!id || x === undefined || y === undefined) continue;
        const screen = toScreen.call(zoom, [x, y]);
        return {
          id,
          clientX: rect.left + screen[0],
          clientY: rect.top + screen[1],
        };
      }
      return null;
    }
    function dispatchPointerMoveInPage(
      container: HTMLElement,
      clientX: number,
      clientY: number,
    ): void {
      container.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          pointerType: "mouse",
        }),
      );
    }
    const scene = window.__graphLabScene;
    if (!scene) throw new Error("graph lab scene is not exposed");
    const field = scene.field;
    const container = field.container;
    if (!container) throw new Error("graph field container is not mounted");
    const target = resolveTargetInPage(field);
    if (!target) throw new Error("no pickable target found");
    const hoverSamples: number[] = [];
    const clickSamples: number[] = [];
    const errors: string[] = [];
    const selectEvents: (string | null | undefined)[] = [];
    const off = scene.controller.on((event) => {
      if (event.kind === "select") selectEvents.push(event.id);
    });
    for (let i = 0; i < iterations; i += 1) {
      const hit = i % 2 === 0;
      const start = performance.now();
      dispatchPointerMoveInPage(
        container,
        hit ? target.clientX : -40,
        hit ? target.clientY : -40,
      );
      hoverSamples.push(performance.now() - start);
      const expected = hit ? target.id : null;
      const actual = field.debugSnapshot().hoveredId;
      if (actual !== expected) {
        errors.push(`hover ${i}: expected ${expected}, got ${actual}`);
      }
    }
    for (let i = 0; i < iterations; i += 1) {
      const start = performance.now();
      container.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          clientX: target.clientX,
          clientY: target.clientY,
        }),
      );
      clickSamples.push(performance.now() - start);
      const selected = selectEvents.at(-1);
      if (selected !== target.id) {
        errors.push(`click ${i}: expected ${target.id}, got ${selected}`);
      }
    }
    off();
    return {
      pointCount: field.debugSnapshot().pointCount,
      targetId: target.id,
      hoverSamples,
      clickSamples,
      errors,
    };
  }, SURFACE_ITERATIONS);
  return {
    pointCount: result.pointCount,
    targetId: result.targetId,
    hover: summarizeLatency(result.hoverSamples),
    click: summarizeLatency(result.clickSamples),
    errors: result.errors,
  };
}

async function assertGraphState(page: Page, expectedPointCount: number): Promise<void> {
  const debug = await page.evaluate(() =>
    window.__graphLabScene?.field.debugSnapshot(),
  );
  expect(debug?.pointCount).toBe(expectedPointCount);
  expect(debug?.representationMode.staticLayout).toBe(false);
  expect(debug?.simulationState?.active).toBe(true);
  expect(debug?.simulationState?.running).toBe(true);
  expect(debug?.simulationState?.alpha ?? 0).toBeGreaterThan(0);
}

function assertFrameSummary(label: string, summary: FrameSummary): void {
  expect(summary.frames, `${label} must collect frame samples`).toBeGreaterThan(20);
  expect(
    summary.avgMs,
    `${label} average ${summary.avgMs.toFixed(2)} ms must stay near 60fps`,
  ).toBeLessThan(FRAME_AVG_BUDGET_MS);
  expect(
    summary.p95Ms,
    `${label} p95 ${summary.p95Ms.toFixed(2)} ms exceeded headless 60fps gate`,
  ).toBeLessThan(FRAME_P95_BUDGET_MS);
  expect(
    summary.missedFrameRatio,
    `${label} missed-frame ratio ${(summary.missedFrameRatio * 100).toFixed(1)}% is too high`,
  ).toBeLessThan(MISSED_FRAME_RATIO_BUDGET);
}

function assertLatencySummary(
  label: string,
  summary: LatencySummary,
  p95BudgetMs: number,
): void {
  expect(summary.samples, `${label} must collect latency samples`).toBe(
    SURFACE_ITERATIONS,
  );
  expect(
    summary.p95Ms,
    `${label} p95 ${summary.p95Ms.toFixed(3)} ms exceeded ${p95BudgetMs} ms`,
  ).toBeLessThan(p95BudgetMs);
}

function assertColdHoverActivation(
  label: string,
  summary: HoverActivationSummary,
  frameBudgetMs: number,
): void {
  expect(summary.hoveredId, `${label} must activate the target hover`).toBe(
    summary.targetId,
  );
  expect(
    summary.dispatchMs,
    `${label} dispatch ${summary.dispatchMs.toFixed(3)} ms exceeded sync budget`,
  ).toBeLessThan(frameBudgetMs);
  expect(
    summary.frameMs,
    `${label} cold activation frame ${summary.frameMs.toFixed(2)} ms exceeded ${frameBudgetMs} ms`,
  ).toBeLessThan(frameBudgetMs);
}

test("graph lab stays idle and interactive at live surface budgets", async ({
  page,
}) => {
  const readPixelsWarnings: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (/ReadPixels/i.test(text)) readPixelsWarnings.push(text);
  });
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
    } catch {
      // Restricted browser contexts can reject localStorage. The graph lab still
      // falls back to the sample source.
    }
  });

  await page.goto(GRAPH_URL);
  await waitForGraph(page, 11);
  readPixelsWarnings.length = 0;
  await page.evaluate(() =>
    window.__graphLabScene?.controller.command({
      kind: "set-simulation-active",
      active: true,
    }),
  );
  await waitForSimulationRunning(page, 11);
  await assertGraphState(page, 11);

  const smallSimulationFrames = await measureFrames(page, false);
  const smallColdHover = await measureColdHoverActivation(page);
  const smallSimulationHoverFrames = await measureFrames(page, true);
  const smallLatency = await measureSurfaceLatency(page);
  await assertGraphState(page, 11);

  const synthetic = buildSyntheticSceneGraph(LARGE_NODE_COUNT, LARGE_EDGE_COUNT);
  await page.evaluate(({ nodes, edges }) => {
    const scene = window.__graphLabScene;
    if (!scene) throw new Error("graph lab scene is not exposed");
    scene.controller.command({ kind: "set-data", nodes, edges });
    scene.controller.command({ kind: "set-simulation-active", active: true });
    scene.controller.command({ kind: "fit-to-view" });
  }, synthetic);
  await waitForGraph(page, LARGE_NODE_COUNT);
  readPixelsWarnings.length = 0;
  await waitForSimulationRunning(page, LARGE_NODE_COUNT);
  await assertGraphState(page, LARGE_NODE_COUNT);

  const largeSimulationFrames = await measureFrames(page, false);
  const largeColdHover = await measureColdHoverActivation(page);
  const largeSimulationHoverFrames = await measureFrames(page, true);
  const largeLatency = await measureSurfaceLatency(page);
  await assertGraphState(page, LARGE_NODE_COUNT);

  const perfSummary = {
    small: {
      simulationFrames: smallSimulationFrames,
      coldHover: smallColdHover,
      simulationHoverFrames: smallSimulationHoverFrames,
      latency: smallLatency,
    },
    large: {
      simulationFrames: largeSimulationFrames,
      coldHover: largeColdHover,
      simulationHoverFrames: largeSimulationHoverFrames,
      latency: largeLatency,
    },
  };
  console.log(JSON.stringify(perfSummary));
  test.info().annotations.push({
    type: "perf",
    description: JSON.stringify(perfSummary),
  });

  assertFrameSummary("11-node simulation", smallSimulationFrames);
  assertColdHoverActivation(
    "11-node cold hover",
    smallColdHover,
    SMALL_COLD_HOVER_FRAME_BUDGET_MS,
  );
  assertFrameSummary("11-node simulation hover stream", smallSimulationHoverFrames);
  expect(smallLatency.errors).toEqual([]);
  assertLatencySummary(
    "11-node hover dispatch",
    smallLatency.hover,
    SMALL_SURFACE_P95_BUDGET_MS,
  );
  assertLatencySummary(
    "11-node click dispatch",
    smallLatency.click,
    SMALL_SURFACE_P95_BUDGET_MS,
  );
  assertFrameSummary("1000-node simulation", largeSimulationFrames);
  assertColdHoverActivation(
    "1000-node cold hover",
    largeColdHover,
    LARGE_COLD_HOVER_FRAME_BUDGET_MS,
  );
  assertFrameSummary("1000-node simulation hover stream", largeSimulationHoverFrames);
  expect(largeLatency.errors).toEqual([]);
  assertLatencySummary(
    "1000-node hover dispatch",
    largeLatency.hover,
    LARGE_SURFACE_P95_BUDGET_MS,
  );
  assertLatencySummary(
    "1000-node click dispatch",
    largeLatency.click,
    LARGE_SURFACE_P95_BUDGET_MS,
  );
  expect(readPixelsWarnings).toEqual([]);
});
