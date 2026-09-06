import type { Mesh, WebGLRenderer } from "three";
import type { Simulation } from "d3-force";
import { createDashboardScene } from "@app/scene/field/fieldAssembly";
import type { ThreeField } from "@app/scene/three/threeField";
import type {
  D3ForceSolver,
  D3Link,
  D3Node,
  TickMetrics,
} from "@app/scene/three/d3ForceSolver";
import { symmetricManyBody } from "@app/scene/three/symmetricManyBody";
import { massCollide, withNodeMass } from "@app/scene/three/d3ForceMass";
import { kernelFixture, sceneFixture, seededRandom, statistics } from "./graphFixtures";
import "@app/styles.css";

// This dev-only observer calls the real implementation; it never replaces physics.
interface ObservedField {
  solver: D3ForceSolver;
  renderer: WebGLRenderer;
  nodeMesh: Mesh;
  positionTex: object;
  raf: number;
  scheduled: boolean;
  frame: (now: number) => void;
  renderFrame: () => void;
  setRunning: (on: boolean) => void;
  wake: () => void;
  simPositions: Float32Array;
  cpuPositions: Float32Array;
  uploadPositions: () => void;
  displayEasing: boolean;
  emphasisAnim: boolean;
  needsRender: boolean;
  simulationClock: {
    stats?: { executedTicks: number; discardedTicks: number };
  };
}

const assembly = createDashboardScene();
const field: ThreeField = assembly.field;
const observed = field as unknown as ObservedField;
const host = document.getElementById("field");
if (!host) throw new Error("Missing benchmark field host");
field.mount(host);
field.command({ kind: "set-autoframe", enabled: false });
let scene = sceneFixture(1);
let settleTicks = 0,
  settleCpuMs = 0;
const pause = () => {
  field.command({ kind: "set-simulation-active", active: false });
  cancelAnimationFrame(observed.raf);
  observed.raf = 0;
  observed.scheduled = false;
};
pause();

const inputDelays: number[] = [];
const eventDurations: number[] = [];
document.getElementById("input")?.addEventListener("pointerdown", (event) => {
  if (inputDelays.length < 100) inputDelays.push(performance.now() - event.timeStamp);
});
const events = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (
      eventDurations.length < 100 &&
      ["pointerdown", "pointerup", "click"].includes(entry.name)
    ) {
      eventDurations.push(entry.duration);
    }
  }
});
if (PerformanceObserver.supportedEntryTypes.includes("event")) {
  events.observe({
    type: "event",
    buffered: false,
    durationThreshold: 16,
  } as PerformanceObserverInit);
}

export function environment() {
  if (!observed.renderer) throw new Error("Production field could not create WebGL");
  const gl = observed.renderer.getContext();
  const extension = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    userAgent: navigator.userAgent,
    cores: navigator.hardwareConcurrency,
    dpr: devicePixelRatio,
    viewport: [innerWidth, innerHeight],
    contextLost: gl.isContextLost(),
    renderer: extension
      ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER),
  };
}

function createKernels(count: number, shape: "cold" | "dense" | "line") {
  if (!Number.isInteger(count) || count < 10 || count > 20000) {
    throw new Error("Kernel fixtures require between 10 and 20000 nodes");
  }
  if (!["cold", "dense", "line"].includes(shape)) {
    throw new Error("Unknown kernel fixture shape");
  }
  pause();
  const { nodes, masses } = kernelFixture(count, shape);
  const forces = [
    {
      name: "charge",
      force: withNodeMass(symmetricManyBody(-120, 10, 400, 0.5), masses),
    },
    {
      name: "collision",
      force: massCollide(masses, 3, 0.35, 1),
    },
  ];
  for (const { force } of forces) force.initialize?.(nodes, seededRandom());
  return { nodes, forces, reverse: true };
}

// One replaceable, node-bounded fixture; sampling retains no timing history.
let kernelState: ReturnType<typeof createKernels> | null = null;

export function initializeKernels(count: number, shape: "cold" | "dense" | "line") {
  kernelState = createKernels(count, shape);
}

export function clearKernels() {
  kernelState = null;
}

export function sampleKernels(): { charge: number; collision: number } {
  if (!kernelState) throw new Error("Initialize kernel fixtures before sampling");
  const { nodes, forces, reverse } = kernelState;
  const sample = { charge: 0, collision: 0 };
  for (let i = 0; i < forces.length; i++) {
    const { force, name } = forces[reverse ? forces.length - 1 - i : i];
    for (const node of nodes) node.vx = node.vy = 0;
    const start = performance.now();
    force(0.3);
    const elapsed = performance.now() - start;
    if (name === "charge") sample.charge = elapsed;
    else sample.collision = elapsed;
  }
  kernelState.reverse = !reverse;
  return sample;
}

export function kernels(count: number, shape: "cold" | "dense" | "line") {
  initializeKernels(count, shape);
  const charge: number[] = [],
    collision: number[] = [];
  for (let round = 0; round < 25; round++) {
    const sample = sampleKernels();
    if (round >= 5) {
      charge.push(sample.charge);
      collision.push(sample.collision);
    }
  }
  return {
    count,
    shape,
    charge: statistics(charge),
    collision: statistics(collision),
  };
}

export function rebuild(count: number) {
  pause();
  field.command({ kind: "set-frozen", frozen: true });
  scene = sceneFixture(count);
  field.command({ kind: "set-data", ...scene, reset: true });
  const css = window.getComputedStyle;
  let reads = 0,
    replacements = 0;
  const times: number[] = [];
  window.getComputedStyle = (...args) => {
    reads++;
    return css(...args);
  };
  try {
    for (let i = 0; i < 12; i++) {
      reads = 0;
      const solver = observed.solver,
        texture = observed.positionTex;
      const nodes = scene.nodes.map((n) => ({ ...n }));
      const edges = scene.edges.map((e) => ({ ...e }));
      const start = performance.now();
      field.command({
        kind: "set-data",
        nodes,
        edges,
      });
      if (i >= 2) times.push(performance.now() - start);
      if (solver !== observed.solver || texture !== observed.positionTex)
        replacements++;
    }
    return {
      count,
      edges: scene.edges.length,
      cpu: statistics(times),
      styleReads: reads,
      replacements,
    };
  } finally {
    window.getComputedStyle = css;
    pause();
  }
}

export function prepare(count: number) {
  pause();
  field.command({ kind: "set-frozen", frozen: false });
  scene = sceneFixture(count);
  const start = performance.now();
  field.command({ kind: "set-data", ...scene, reset: true });
  const coldMs = performance.now() - start;
  pause();
  settleTicks = settleCpuMs = 0;
  return { count, edges: scene.edges.length, coldMs };
}

export async function live(durationMs = 3000) {
  pause();
  const windowStart = performance.now();
  const solver = observed.solver;
  const clock = observed.simulationClock.stats;
  const initialExecuted = clock?.executedTicks ?? 0;
  const initialDiscarded = clock?.discardedTicks ?? 0;
  const originalTick = solver.tick,
    originalFrame = observed.frame,
    originalRender = observed.renderFrame;
  const frames: number[] = [],
    ticks: number[] = [],
    renders: number[] = [],
    steps: number[] = [],
    intervals: number[] = [];
  let inFrame = 0,
    lastFrame: number | null = null;
  inputDelays.length = eventDurations.length = 0;
  solver.tick = function () {
    const start = performance.now();
    inFrame++;
    try {
      return originalTick.call(this);
    } finally {
      if (ticks.length < 2000) ticks.push(performance.now() - start);
    }
  };
  observed.renderFrame = function () {
    const start = performance.now();
    try {
      originalRender.call(this);
    } finally {
      if (renders.length < 1000) renders.push(performance.now() - start);
    }
  };
  observed.frame = (now) => {
    const start = performance.now();
    if (lastFrame !== null && intervals.length < 1000) intervals.push(now - lastFrame);
    lastFrame = now;
    inFrame = 0;
    try {
      originalFrame(now);
    } finally {
      if (frames.length < 1000) {
        frames.push(performance.now() - start);
        steps.push(inFrame);
      }
    }
  };
  try {
    observed.setRunning(true);
    observed.wake();
    await new Promise((resolve) => setTimeout(resolve, Math.min(5000, durationMs)));
  } finally {
    pause();
    solver.tick = originalTick;
    observed.frame = originalFrame;
    observed.renderFrame = originalRender;
  }
  return {
    windowMs: performance.now() - windowStart,
    frames: statistics(frames),
    ticks: statistics(ticks),
    renderCpu: statistics(renders),
    frameIntervals: statistics(intervals),
    steps,
    clock: clock
      ? {
          executed: clock.executedTicks - initialExecuted,
          discarded: clock.discardedTicks - initialDiscarded,
        }
      : null,
    active: solver.activeCount,
    pointerQueueDelay: statistics(inputDelays),
    observedEventDuration: statistics(eventDurations),
  };
}

export function settleChunk(limit = 30) {
  pause();
  const solver = observed.solver;
  for (let i = 0; i < Math.min(limit, 60) && !solver.isSettled(); i++) {
    if (settleTicks >= 1600) throw new Error("Settle tick limit reached");
    const start = performance.now();
    solver.tick();
    settleCpuMs += performance.now() - start;
    settleTicks++;
  }
  return {
    settled: solver.isSettled(),
    ticks: settleTicks,
    cpuMs: settleCpuMs,
    alpha: solver.alpha(),
  };
}

export function drag() {
  pause();
  const solver = observed.solver;
  if (!solver.isSettled())
    throw new Error("Local-drag benchmark requires natural settle");
  const index = solver.count - 1,
    position = solver.position(index);
  if (!position) throw new Error("No drag target");
  solver.setDrag(index, position.x, position.y);
  solver.setDrag(index, position.x + 80, position.y);
  const times: number[] = [],
    active: number[] = [];
  let metrics: TickMetrics | undefined;
  let round = 0;
  const simulation = (solver as unknown as { sim: Simulation<D3Node, D3Link> }).sim;
  const forceTimings = ["link", "charge", "collide"].map((name) => {
    const force = simulation.force(name);
    if (!force) throw new Error(`Missing production force: ${name}`);
    const samples: number[] = [];
    simulation.force(name, (alpha) => {
      const start = performance.now();
      try {
        force(alpha);
      } finally {
        if (round >= 5) samples.push(performance.now() - start);
      }
    });
    return { name, force, samples };
  });
  try {
    for (; round < 35; round++) {
      const start = performance.now();
      metrics = solver.tick();
      if (round >= 5) {
        times.push(performance.now() - start);
        active.push(metrics.awake);
      }
    }
  } finally {
    for (const { name, force } of forceTimings) simulation.force(name, force);
  }
  solver.pack(observed.simPositions);
  observed.cpuPositions.set(observed.simPositions);
  observed.uploadPositions();
  return {
    cpu: statistics(times),
    components: Object.fromEntries(
      forceTimings.map(({ name, samples }) => [name, statistics(samples)]),
    ),
    freeAwake: [Math.min(...active), Math.max(...active)],
    held: 1,
  };
}

export async function idle() {
  pause();
  observed.solver.clearDrag();
  observed.solver.prewarmReflow(() => false, 0.005, 0);
  observed.displayEasing = observed.emphasisAnim = observed.needsRender = false;
  const original = observed.renderFrame;
  const originalFrame = observed.frame;
  let renders = 0,
    callbacks = 0;
  observed.renderFrame = () => {
    renders++;
    original.call(observed);
  };
  observed.frame = (now) => {
    callbacks++;
    originalFrame(now);
  };
  try {
    observed.wake();
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } finally {
    observed.renderFrame = original;
    observed.frame = originalFrame;
  }
  return {
    intervalMs: 1000,
    callbacks,
    renderCalls: renders,
    scheduled: observed.scheduled,
  };
}

export function destroy() {
  clearKernels();
  events.disconnect();
  field.destroy();
}
