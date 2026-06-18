import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";

import { createDashboardScene } from "../scene/field/fieldAssembly";
import {
  COSMOS_SIMULATION_DEFAULTS,
  type CosmosSimulationConfig,
} from "../scene/field/cosmosConfig";
import type { RepresentationMode } from "../scene/field/representationLayout";
import { sliceToScene } from "../scene/sceneMapping";
import { EDGE_RENDER_DEFAULTS, type EdgeRenderParams } from "../scene/sceneController";
import type { GraphSlice } from "../stores/server/engine";
import { adaptGraphSlice, unwrapEnvelope } from "../stores/server/liveAdapters";
import { graphLabDevSlice } from "./sampleGraph";

const scene = createDashboardScene();
type GraphLabDebug = ReturnType<(typeof scene)["field"]["debugSnapshot"]>;
type GraphLabSource = "sample" | "live" | "manual";
type FetchLiveGraph = (options?: { attempts?: number }) => Promise<void>;
type GraphLabGlobal = typeof globalThis & {
  __graphLabScene?: typeof scene;
  __graphLabLoadDevSlice?: (raw: unknown, label: string) => void;
  __graphLabCurrentSource?: GraphLabSource;
};

const graphLabGlobal = globalThis as GraphLabGlobal;

if (import.meta.hot) {
  import.meta.hot.accept("./sampleGraph", (mod) => {
    const next = mod as typeof import("./sampleGraph") | undefined;
    if (next && graphLabGlobal.__graphLabCurrentSource === "sample") {
      graphLabGlobal.__graphLabLoadDevSlice?.(
        next.graphLabDevSlice,
        "Dev graph hot reloaded",
      );
    }
  });
}

const REPRESENTATION_MODES: RepresentationMode[] = [
  "connectivity",
  "temporal",
  "lineage",
  "hierarchical",
  "radial",
  "community",
  "semantic",
];

const DEFAULT_LIVE_BASE = "/api";
const DEFAULT_LIVE_SCOPE = import.meta.env.VITE_GRAPH_LAB_SCOPE ?? "";
const GRAPH_LAB_SOURCE_STORAGE_KEY = "vaultspec.graphLab.source";
const GRAPH_LAB_LIVE_SETTINGS_STORAGE_KEY = "vaultspec.graphLab.liveSettings";
const DEFAULT_DOCUMENT_DOC_TYPES = [
  "research",
  "reference",
  "adr",
  "plan",
  "exec",
  "audit",
] as const;
const DEFAULT_DOCUMENT_RELATIONS = [
  "fulfills",
  "implements",
  "resolves",
  "reviews",
  "mentions",
  "touches",
  "resembles",
  "references",
] as const;

const COSMOS_CONTROLS: {
  key: keyof CosmosSimulationConfig;
  label: string;
  min?: number;
  max?: number;
  step: number;
}[] = [
  {
    key: "simulationDecay",
    label: "Simulation decay",
    min: 100,
    max: 10000,
    step: 100,
  },
  {
    key: "simulationGravity",
    label: "Simulation gravity",
    min: 0,
    max: 0.5,
    step: 0.01,
  },
  { key: "simulationCenter", label: "Simulation center", min: 0, max: 8, step: 0.01 },
  {
    key: "simulationRepulsion",
    label: "Simulation repulsion",
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: "simulationRepulsionTheta",
    label: "Repulsion theta",
    min: 0.3,
    max: 2,
    step: 0.01,
  },
  { key: "simulationLinkSpring", label: "Link spring", min: 0, max: 2, step: 0.01 },
  { key: "simulationLinkDistance", label: "Link distance", min: 1, max: 40, step: 0.5 },
  {
    key: "simulationFriction",
    label: "Simulation friction",
    min: 0,
    max: 1,
    step: 0.01,
  },
  { key: "pointSizeScale", label: "Point size scale", min: 0.1, max: 4, step: 0.05 },
  { key: "coldStartAlpha", label: "Cold start alpha", min: 0, max: 1, step: 0.01 },
  { key: "warmStartAlpha", label: "Warm start alpha", min: 0, max: 1, step: 0.01 },
  { key: "changeStartAlpha", label: "Change start alpha", min: 0, max: 1, step: 0.01 },
  { key: "pinStartAlpha", label: "Pin start alpha", min: 0, max: 1, step: 0.01 },
  {
    key: "interactionStartAlpha",
    label: "Interaction start alpha",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "interactionSimulationDecay",
    label: "Interaction decay",
    min: 100,
    max: 10000,
    step: 100,
  },
];

const FORCE_EFFECTS: {
  key: keyof CosmosSimulationConfig;
  label: string;
  unit: string;
  effect: string;
}[] = [
  {
    key: "simulationRepulsion",
    label: "Repulsion",
    unit: "Cosmos",
    effect: "Higher pushes unrelated points farther apart.",
  },
  {
    key: "simulationLinkDistance",
    label: "Link distance",
    unit: "Cosmos",
    effect: "The rest distance between connected points.",
  },
  {
    key: "simulationLinkSpring",
    label: "Link spring",
    unit: "Cosmos",
    effect: "Higher makes connected points track their rest distance harder.",
  },
  {
    key: "simulationGravity",
    label: "Gravity",
    unit: "Cosmos",
    effect: "Higher pulls every point toward the simulation center.",
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeGraphSlice(raw: unknown): GraphSlice {
  const unwrapped = unwrapEnvelope(raw);
  const source =
    isRecord(unwrapped) &&
    isRecord(unwrapped.data) &&
    Array.isArray(unwrapped.data.nodes)
      ? { ...unwrapped.data, tiers: unwrapped.tiers }
      : unwrapped;
  const adapted = adaptGraphSlice(source);
  return {
    ...adapted,
    nodes: Array.isArray(adapted.nodes) ? adapted.nodes : [],
    edges: Array.isArray(adapted.edges) ? adapted.edges : [],
    tiers: adapted.tiers ?? {},
  };
}

function countBy<T>(items: readonly T[], keyOf: (item: T) => string | undefined) {
  const out: Record<string, number> = {};
  for (const item of items) {
    const key = keyOf(item) || "unknown";
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function parseJsonSlice(text: string): GraphSlice {
  return normalizeGraphSlice(JSON.parse(text) as unknown);
}

function liveGraphFilter(
  granularity: "feature" | "document",
  includeIndexDocs: boolean,
  includeCoreDerived: boolean,
): Record<string, unknown> | undefined {
  if (granularity !== "document") return undefined;
  const filter: Record<string, unknown> = {};
  if (!includeIndexDocs) filter.doc_types = [...DEFAULT_DOCUMENT_DOC_TYPES];
  if (!includeCoreDerived) filter.relations = [...DEFAULT_DOCUMENT_RELATIONS];
  return Object.keys(filter).length > 0 ? filter : undefined;
}

function summarizeRawGraph(text: string): {
  nodes: number;
  edges: number;
  metaEdges: number;
} | null {
  if (!text.trim()) return null;
  try {
    const raw = unwrapEnvelope(JSON.parse(text) as unknown);
    const source =
      isRecord(raw) && isRecord(raw.data) && Array.isArray(raw.data.nodes)
        ? raw.data
        : raw;
    if (!isRecord(source)) return null;
    return {
      nodes: Array.isArray(source.nodes) ? source.nodes.length : 0,
      edges: Array.isArray(source.edges) ? source.edges.length : 0,
      metaEdges: Array.isArray(source.meta_edges) ? source.meta_edges.length : 0,
    };
  } catch {
    return null;
  }
}

function firstVaultScope(raw: unknown): string | null {
  const unwrapped = unwrapEnvelope(raw);
  const source =
    isRecord(unwrapped) && isRecord(unwrapped.data) ? unwrapped.data : unwrapped;
  if (!isRecord(source)) return null;
  const worktrees = Array.isArray(source.worktrees) ? source.worktrees : [];
  for (const entry of worktrees) {
    if (!isRecord(entry)) continue;
    if (entry.has_vault === false) continue;
    if (typeof entry.path === "string" && entry.path.trim()) return entry.path;
  }
  const corpusViews = Array.isArray(source.corpus_views) ? source.corpus_views : [];
  for (const entry of corpusViews) {
    if (
      isRecord(entry) &&
      typeof entry.worktree === "string" &&
      entry.worktree.trim()
    ) {
      return entry.worktree;
    }
  }
  return null;
}

function sortedEntries(record: Record<string, number>): [string, number][] {
  return Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="graph-lab-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function compactId(id: string | null): string {
  if (!id) return "none";
  return id.length > 28 ? `${id.slice(0, 25)}...` : id;
}

function Distribution({
  title,
  values,
}: {
  title: string;
  values: Record<string, number>;
}) {
  const entries = sortedEntries(values);
  return (
    <section className="graph-lab-section">
      <h2>{title}</h2>
      {entries.length === 0 ? (
        <p className="graph-lab-muted">No values</p>
      ) : (
        <div className="graph-lab-bars">
          {entries.map(([key, value]) => (
            <div className="graph-lab-bar" key={key}>
              <span>{key}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function numberFromInput(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatNumber(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.0";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function readStoredSource(): GraphLabSource | null {
  try {
    const value = window.localStorage.getItem(GRAPH_LAB_SOURCE_STORAGE_KEY);
    return value === "sample" || value === "live" || value === "manual" ? value : null;
  } catch {
    return null;
  }
}

function writeStoredSource(source: GraphLabSource): void {
  try {
    window.localStorage.setItem(GRAPH_LAB_SOURCE_STORAGE_KEY, source);
  } catch {
    /* localStorage can be unavailable in restricted browser contexts */
  }
}

function readStoredLiveSettings(): {
  liveBase?: string;
  liveScope?: string;
  liveGranularity?: "feature" | "document";
  includeIndexDocs?: boolean;
  includeCoreDerived?: boolean;
  liveStreamRefresh?: boolean;
} {
  try {
    const raw = window.localStorage.getItem(GRAPH_LAB_LIVE_SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      liveBase: typeof parsed.liveBase === "string" ? parsed.liveBase : undefined,
      liveScope: typeof parsed.liveScope === "string" ? parsed.liveScope : undefined,
      liveGranularity:
        parsed.liveGranularity === "feature" || parsed.liveGranularity === "document"
          ? parsed.liveGranularity
          : undefined,
      includeIndexDocs:
        typeof parsed.includeIndexDocs === "boolean"
          ? parsed.includeIndexDocs
          : undefined,
      includeCoreDerived:
        typeof parsed.includeCoreDerived === "boolean"
          ? parsed.includeCoreDerived
          : undefined,
      liveStreamRefresh:
        typeof parsed.liveStreamRefresh === "boolean"
          ? parsed.liveStreamRefresh
          : undefined,
    };
  } catch {
    return {};
  }
}

export function GraphLab() {
  const storedLiveSettings = useMemo(() => readStoredLiveSettings(), []);
  const initialSource = useMemo(() => readStoredSource() ?? "sample", []);
  const hostRef = useRef<HTMLDivElement>(null);
  const [jsonText, setJsonText] = useState("");
  const [status, setStatus] = useState("Loading sample graph...");
  const [engineStatus, setEngineStatus] = useState(
    initialSource === "live"
      ? "restoring live vault graph"
      : "detached: graph:dev sample, no vaultspec serve",
  );
  const [slice, setSlice] = useState<GraphSlice | null>(null);
  const [debug, setDebug] = useState<GraphLabDebug>(() => scene.field.debugSnapshot());
  // On-demand sample of live point positions (an explicit GPU readback, never on
  // the poll timer). Populated by the "Read 8 points" button.
  const [samplePoints, setSamplePoints] = useState<
    { id: string; x: number; y: number }[]
  >([]);
  const [perf, setPerf] = useState({ fps: 0, frameMs: 0, maxFrameMs: 0 });
  const [cosmosConfig, setCosmosConfig] = useState<CosmosSimulationConfig>({
    ...COSMOS_SIMULATION_DEFAULTS,
  });
  const [edgeRenderParams, setEdgeRenderParams] = useState<EdgeRenderParams>({
    ...EDGE_RENDER_DEFAULTS,
  });
  const [bounds, setBounds] = useState<{
    shape: "free" | "circle" | "rect";
    size: number;
  }>({ shape: "free", size: 0 });
  const [mode, setMode] = useState<RepresentationMode>("connectivity");
  const [paused, setPaused] = useState(false);
  const [source, setSource] = useState<GraphLabSource>(initialSource);
  const [liveBase, setLiveBase] = useState(
    storedLiveSettings.liveBase ?? DEFAULT_LIVE_BASE,
  );
  const [liveScope, setLiveScope] = useState(
    storedLiveSettings.liveScope ?? DEFAULT_LIVE_SCOPE,
  );
  const [liveToken, setLiveToken] = useState("");
  const [liveGranularity, setLiveGranularity] = useState<"feature" | "document">(
    storedLiveSettings.liveGranularity ?? "document",
  );
  const [includeIndexDocs, setIncludeIndexDocs] = useState(
    storedLiveSettings.includeIndexDocs ?? false,
  );
  const [includeCoreDerived, setIncludeCoreDerived] = useState(
    storedLiveSettings.includeCoreDerived ?? false,
  );
  const [liveStreamRefresh, setLiveStreamRefresh] = useState(
    storedLiveSettings.liveStreamRefresh ?? false,
  );
  const fetchLiveGraphRef = useRef<FetchLiveGraph>(async () => undefined);
  const loadRawSliceRef = useRef<(raw: unknown, label: string) => void>(
    () => undefined,
  );
  const sliceRef = useRef<GraphSlice | null>(null);
  const controlsRef = useRef({
    cosmosConfig,
    edgeRenderParams,
    bounds,
  });
  const pausedRef = useRef(paused);

  const shouldRunSimulation = useCallback(
    () => !pausedRef.current && (typeof document === "undefined" || !document.hidden),
    [],
  );

  const syncSimulationActive = useCallback(() => {
    scene.controller.command({
      kind: "set-simulation-active",
      active: shouldRunSimulation(),
    });
  }, [shouldRunSimulation]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    scene.controller.mount(host);
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) scene.controller.resize(rect.width, rect.height);
    });
    observer.observe(host);
    // The debug snapshot is read on a SLOW cadence and WITHOUT the point-position
    // dump: `debugSnapshot()` defaults to no `getPointPositions()` readback (a GPU
    // pipeline stall). A fast poll that read back all positions froze the page on a
    // live ~3k-node graph regardless of GPU power.
    const timer = window.setInterval(() => {
      setDebug(scene.field.debugSnapshot());
    }, 500);
    graphLabGlobal.__graphLabScene = scene;
    return () => {
      window.clearInterval(timer);
      observer.disconnect();
      scene.controller.destroy();
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let sampleStart = last;
    let frames = 0;
    let frameMsTotal = 0;
    let maxFrameMs = 0;
    const tick = (now: number) => {
      const frameMs = now - last;
      frames += 1;
      frameMsTotal += frameMs;
      maxFrameMs = Math.max(maxFrameMs, frameMs);
      if (now - sampleStart >= 500) {
        setPerf({
          fps: (frames * 1000) / (now - sampleStart),
          frameMs: frameMsTotal / frames,
          maxFrameMs,
        });
        sampleStart = now;
        frames = 0;
        frameMsTotal = 0;
        maxFrameMs = 0;
      }
      last = now;
      raf = window.requestAnimationFrame(tick);
    };
    const start = () => {
      if (raf) return;
      last = sampleStart = performance.now();
      frames = 0;
      frameMsTotal = 0;
      maxFrameMs = 0;
      raf = window.requestAnimationFrame(tick);
    };
    const stop = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    };
    // The FPS sampler is a measurement loop; pause it when the tab is hidden so it
    // does not spin an animation frame on a backgrounded lab.
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) start();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, []);

  useEffect(() => {
    controlsRef.current = {
      cosmosConfig,
      edgeRenderParams,
      bounds,
    };
  }, [bounds, cosmosConfig, edgeRenderParams]);

  useEffect(() => {
    writeStoredSource(source);
    graphLabGlobal.__graphLabCurrentSource = source;
  }, [source]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        GRAPH_LAB_LIVE_SETTINGS_STORAGE_KEY,
        JSON.stringify({
          liveBase,
          liveScope,
          liveGranularity,
          includeIndexDocs,
          includeCoreDerived,
          liveStreamRefresh,
        }),
      );
    } catch {
      /* localStorage can be unavailable in restricted browser contexts */
    }
  }, [
    includeCoreDerived,
    includeIndexDocs,
    liveBase,
    liveGranularity,
    liveScope,
    liveStreamRefresh,
  ]);

  useEffect(() => {
    pausedRef.current = paused;
    syncSimulationActive();
  }, [paused, syncSimulationActive]);

  useEffect(() => {
    const onVisibilityChange = () => syncSimulationActive();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [syncSimulationActive]);

  const stats = useMemo(() => {
    const nodes = slice?.nodes ?? [];
    const edges = slice?.edges ?? [];
    const docs = nodes.filter((node) => node.kind === "document");
    return {
      totalNodes: nodes.length,
      totalDocs: docs.length,
      totalEdges: edges.length,
      averageDegree: nodes.length > 0 ? (edges.length * 2) / nodes.length : 0,
      featureNodes: nodes.filter((node) => node.kind === "feature").length,
      codeNodes: nodes.filter((node) => node.kind === "code-artifact").length,
      planContainers: nodes.filter((node) => node.kind === "plan-container").length,
      kinds: countBy(nodes, (node) => node.kind),
      docTypes: countBy(docs, (node) => node.doc_type ?? "unknown"),
      tiers: countBy(edges, (edge) => edge.tier),
      relations: countBy(edges, (edge) => edge.relation),
    };
  }, [slice]);

  const rawSummary = useMemo(() => summarizeRawGraph(jsonText), [jsonText]);

  const simulationActive = debug.simulationState?.active ?? false;
  const simulationStatus = paused
    ? "paused"
    : debug.simulationState == null
      ? "unmounted"
      : debug.simulationState.running
        ? "running"
        : simulationActive
          ? "idle"
          : "inactive";

  const applySlice = useCallback(
    (next: GraphSlice, label: string) => {
      const controls = controlsRef.current;
      sliceRef.current = next;
      setSlice(next);
      const mapped = sliceToScene(next);
      scene.controller.command({
        kind: "set-data",
        nodes: mapped.nodes,
        edges: mapped.edges,
      });
      scene.controller.command({
        kind: "set-cosmos-config",
        config: controls.cosmosConfig,
      });
      scene.controller.command({
        kind: "set-edge-render-params",
        params: controls.edgeRenderParams,
      });
      scene.controller.command({
        kind: "set-bounds",
        shape: controls.bounds.shape,
        size: controls.bounds.size > 0 ? controls.bounds.size : undefined,
      });
      window.requestAnimationFrame(() => {
        scene.controller.command({ kind: "fit-to-view" });
        syncSimulationActive();
      });
      setStatus(`${label}: ${next.nodes.length} nodes, ${next.edges.length} edges`);
    },
    [syncSimulationActive],
  );

  const loadRawSlice = useCallback(
    (raw: unknown, label: string) => {
      const next = normalizeGraphSlice(raw);
      setJsonText(JSON.stringify(raw, null, 2));
      applySlice(next, label);
    },
    [applySlice],
  );

  useEffect(() => {
    loadRawSliceRef.current = loadRawSlice;
  }, [loadRawSlice]);

  const resetDevGraph = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
    setSource("sample");
    scene.controller.command({ kind: "set-simulation-active", active: false });
    scene.controller.command({ kind: "set-data", nodes: [], edges: [] });
    setStatus("Loading sample graph...");
    window.requestAnimationFrame(() => {
      loadRawSlice(graphLabDevSlice, "Dev graph loaded");
      setEngineStatus("detached: graph:dev sample, no vaultspec serve");
    });
  }, [loadRawSlice]);

  useEffect(() => {
    graphLabGlobal.__graphLabLoadDevSlice = loadRawSlice;
    return () => {
      if (graphLabGlobal.__graphLabLoadDevSlice === loadRawSlice) {
        delete graphLabGlobal.__graphLabLoadDevSlice;
      }
    };
  }, [loadRawSlice]);

  const resetGraph = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
    scene.controller.command({ kind: "set-simulation-active", active: false });
    scene.controller.command({ kind: "set-data", nodes: [], edges: [] });
    setStatus("Rewinding current graph...");
    window.requestAnimationFrame(() => {
      if (slice) {
        applySlice(slice, "Current graph reset");
      } else {
        setSource("sample");
        loadRawSlice(graphLabDevSlice, "Dev graph loaded");
      }
    });
  }, [applySlice, loadRawSlice, slice]);

  function loadPastedJson() {
    try {
      applySlice(parseJsonSlice(jsonText), "Pasted JSON loaded");
      setSource("manual");
      setEngineStatus("manual JSON: engine bypassed");
    } catch (err) {
      setStatus(`JSON parse failed: ${(err as Error).message}`);
    }
  }

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setJsonText(text);
      applySlice(parseJsonSlice(text), file.name);
      setSource("manual");
      setEngineStatus(`file: ${file.name}`);
    } catch (err) {
      setStatus(`File load failed: ${(err as Error).message}`);
    }
  }

  const fetchLiveGraph = useCallback(
    async (options: { attempts?: number } = {}) => {
      const base = liveBase.trim().replace(/\/$/, "");
      let scope = liveScope.trim();
      if (!scope) {
        try {
          setEngineStatus(`discovering scopes: ${base || ""}/map`);
          const response = await fetch(`${base || ""}/map`);
          const body = (await response.json()) as unknown;
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          scope = firstVaultScope(body) ?? "";
          if (scope) setLiveScope(scope);
        } catch (err) {
          setEngineStatus(`scope discovery failed: ${(err as Error).message}`);
        }
      }
      if (!scope) {
        setStatus("Live fetch needs a scope.");
        if (!sliceRef.current) {
          scene.controller.command({ kind: "set-simulation-active", active: false });
        }
        return;
      }
      const url = `${base || ""}/graph/query`;
      const attempts = Math.max(1, options.attempts ?? 1);
      let message = "";
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          setEngineStatus(
            attempts > 1
              ? `fetching: ${url} (${attempt}/${attempts})`
              : `fetching: ${url}`,
          );
          const headers = new Headers({ "content-type": "application/json" });
          if (liveToken.trim())
            headers.set("authorization", `Bearer ${liveToken.trim()}`);
          const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
              scope,
              granularity: liveGranularity,
              filter: liveGraphFilter(
                liveGranularity,
                includeIndexDocs,
                includeCoreDerived,
              ),
            }),
          });
          const body = (await response.json()) as unknown;
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const next = normalizeGraphSlice(body);
          setJsonText(JSON.stringify(body, null, 2));
          applySlice(next, `Live vault ${liveGranularity} graph`);
          setSource("live");
          setEngineStatus(`live ok: ${url}`);
          return;
        } catch (err) {
          message = (err as Error).message;
          if (attempt < attempts) {
            setEngineStatus(`live retry: ${url} (${message})`);
            await sleep(900);
          }
        }
      }
      setStatus(`Live fetch failed: ${message}`);
      setEngineStatus(`live failed: ${url}`);
      if (!sliceRef.current) {
        scene.controller.command({ kind: "set-simulation-active", active: false });
      }
    },
    [
      applySlice,
      includeCoreDerived,
      includeIndexDocs,
      liveBase,
      liveGranularity,
      liveScope,
      liveToken,
    ],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (readStoredSource() === "live") {
        setStatus("Restoring live vault graph...");
        scene.controller.command({ kind: "set-simulation-active", active: false });
        void fetchLiveGraphRef.current({ attempts: 12 });
        return;
      }
      setSource("sample");
      loadRawSliceRef.current(graphLabDevSlice, "Dev graph loaded");
      setEngineStatus("detached: graph:dev sample, no vaultspec serve");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function loadLiveGraph() {
    void fetchLiveGraph();
  }

  function refreshLiveGraph() {
    void fetchLiveGraph();
  }

  useEffect(() => {
    fetchLiveGraphRef.current = fetchLiveGraph;
  }, [fetchLiveGraph]);

  useEffect(() => {
    const scope = liveScope.trim();
    const base = liveBase.trim().replace(/\/$/, "");
    if (!liveStreamRefresh || !scope || liveToken.trim()) return;
    const url = `${base || ""}/stream?channels=graph&scope=${encodeURIComponent(scope)}`;
    const source = new EventSource(url);
    let timer: number | null = null;
    const queueRefresh = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => fetchLiveGraphRef.current(), 300);
    };
    source.addEventListener("graph", queueRefresh);
    source.addEventListener("gap", queueRefresh);
    source.onopen = () => setEngineStatus(`streaming: ${url}`);
    source.onerror = () => setEngineStatus(`stream reconnecting: ${url}`);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      source.close();
    };
  }, [liveBase, liveScope, liveStreamRefresh, liveToken]);

  function applyCosmosConfig(update: Partial<CosmosSimulationConfig>) {
    const next = { ...cosmosConfig, ...update };
    setCosmosConfig(next);
    scene.controller.command({ kind: "set-cosmos-config", config: update });
  }

  function applyEdgeRender(update: Partial<EdgeRenderParams>) {
    const next = { ...edgeRenderParams, ...update };
    setEdgeRenderParams(next);
    scene.controller.command({ kind: "set-edge-render-params", params: update });
  }

  function applyBounds(update: Partial<typeof bounds>) {
    const next = { ...bounds, ...update };
    setBounds(next);
    scene.controller.command({
      kind: "set-bounds",
      shape: next.shape,
      size: next.size > 0 ? next.size : undefined,
    });
  }

  function applyMode(next: RepresentationMode) {
    setMode(next);
    scene.controller.command({ kind: "set-representation-mode", mode: next });
  }

  function togglePaused() {
    const next = !paused;
    pausedRef.current = next;
    setPaused(next);
    scene.controller.command({
      kind: "set-simulation-active",
      active: shouldRunSimulation(),
    });
  }

  return (
    <main className="graph-lab">
      <section className="graph-lab-canvas" aria-label="graph canvas">
        <div ref={hostRef} className="graph-lab-host" data-graph-lab-host />
        <div className="graph-lab-overlay graph-lab-overlay-primary">
          <div className="graph-lab-overlay-title">Graph debug</div>
          <div className="graph-lab-overlay-grid">
            <Metric label="engine" value={engineStatus} />
            <Metric label="source" value={status} />
            <Metric label="nodes" value={stats.totalNodes} />
            <Metric label="docs" value={stats.totalDocs} />
            <Metric label="edges" value={stats.totalEdges} />
            <Metric label="points" value={debug.pointCount} />
            <Metric label="selected" value={debug.selectedIds.length} />
            <Metric label="hovered" value={compactId(debug.hoveredId)} />
            <Metric label="hover" value={debug.hoverEmphasisIds.length} />
            <Metric label="hover edges" value={debug.hoverEmphasisEdgeCount} />
            <Metric label="phase" value={debug.rendererLifecycle} />
            <Metric
              label="phase age"
              value={`${formatNumber(debug.rendererLifecycleAgeMs, 0)} ms`}
            />
            <Metric label="pending" value={debug.pendingSimulationStart ?? "none"} />
            <Metric label="sim" value={simulationStatus} />
            <Metric label="active" value={simulationActive ? "yes" : "no"} />
            <Metric
              label="alpha"
              value={formatNumber(debug.simulationState?.alpha ?? 0, 4)}
            />
            <Metric label="fps" value={formatNumber(perf.fps, 0)} />
            <Metric label="frame" value={`${formatNumber(perf.frameMs)} ms`} />
            <Metric
              label="point max"
              value={formatNumber(debug.pointSizeStats.effectiveMax, 2)}
            />
            <Metric
              label="link/point"
              value={formatNumber(debug.pointSizeStats.linkDistanceToEffectiveAvg, 2)}
            />
            <Metric
              label="line width"
              value={formatNumber(edgeRenderParams.lineWidthScale, 2)}
            />
          </div>
        </div>
        <div className="graph-lab-overlay graph-lab-overlay-forces">
          <div className="graph-lab-overlay-title">Forces now</div>
          {FORCE_EFFECTS.map((force) => (
            <div className="graph-lab-force-line" key={force.key}>
              <span>{force.label}</span>
              <strong>{formatNumber(cosmosConfig[force.key], 3)}</strong>
            </div>
          ))}
          <div className="graph-lab-force-line">
            <span>Line width</span>
            <strong>{formatNumber(edgeRenderParams.lineWidthScale, 2)}</strong>
          </div>
        </div>
      </section>
      <aside className="graph-lab-inspector" aria-label="graph debug inspector">
        <header className="graph-lab-header">
          <div>
            <p>VaultSpec graph lab</p>
            <h1>Live renderer debug</h1>
          </div>
          <div className="graph-lab-header-actions">
            <button type="button" onClick={loadLiveGraph}>
              Live vault
            </button>
            <button type="button" onClick={resetGraph}>
              Reset graph
            </button>
            <button
              type="button"
              onClick={() => scene.controller.command({ kind: "fit-to-view" })}
            >
              Fit
            </button>
          </div>
        </header>

        <section className="graph-lab-section">
          <h2>Data source</h2>
          <textarea
            value={jsonText}
            onChange={(event) => setJsonText(event.target.value)}
            placeholder="Paste output from vaultspec graph --granularity feature --json or a /graph/query response."
            spellCheck={false}
          />
          <div className="graph-lab-row">
            <button type="button" onClick={loadPastedJson}>
              Load JSON
            </button>
            <label className="graph-lab-file">
              File
              <input type="file" accept="application/json,.json" onChange={loadFile} />
            </label>
          </div>
          <p className="graph-lab-status">{status}</p>
        </section>

        <section className="graph-lab-section">
          <h2>Live vault feed</h2>
          <label>
            Base
            <input
              value={liveBase}
              onChange={(event) => setLiveBase(event.target.value)}
            />
          </label>
          <label>
            Scope
            <input
              value={liveScope}
              onChange={(event) => setLiveScope(event.target.value)}
            />
          </label>
          <label>
            Bearer token
            <input
              value={liveToken}
              onChange={(event) => setLiveToken(event.target.value)}
              type="password"
            />
          </label>
          <div className="graph-lab-row">
            <select
              value={liveGranularity}
              onChange={(event) =>
                setLiveGranularity(event.target.value as "feature" | "document")
              }
            >
              <option value="feature">feature</option>
              <option value="document">document</option>
            </select>
            <button type="button" onClick={refreshLiveGraph}>
              Refresh live
            </button>
          </div>
          <div className="graph-lab-row">
            <button type="button" onClick={loadLiveGraph}>
              Load live vault
            </button>
            <button type="button" onClick={resetDevGraph}>
              Load sample
            </button>
          </div>
          <label className="graph-lab-inline-check">
            <input
              type="checkbox"
              checked={includeIndexDocs}
              onChange={(event) => setIncludeIndexDocs(event.target.checked)}
            />
            <span>Include index docs</span>
          </label>
          <label className="graph-lab-inline-check">
            <input
              type="checkbox"
              checked={includeCoreDerived}
              onChange={(event) => setIncludeCoreDerived(event.target.checked)}
            />
            <span>Include core-derived edges</span>
          </label>
          <label className="graph-lab-inline-check">
            <input
              type="checkbox"
              checked={liveStreamRefresh}
              onChange={(event) => setLiveStreamRefresh(event.target.checked)}
            />
            <span>Refresh on graph stream</span>
          </label>
        </section>

        <section className="graph-lab-section">
          <h2>Current graph</h2>
          <div className="graph-lab-metrics">
            <Metric label="nodes" value={stats.totalNodes} />
            <Metric label="documents" value={stats.totalDocs} />
            <Metric label="features" value={stats.featureNodes} />
            <Metric label="code artifacts" value={stats.codeNodes} />
            <Metric label="plan containers" value={stats.planContainers} />
            <Metric label="edges" value={stats.totalEdges} />
            <Metric label="points" value={debug.pointCount} />
            <Metric label="dropped edges" value={debug.droppedEdges} />
            <Metric label="hover cohort" value={debug.hoverEmphasisIds.length} />
            <Metric label="hover edges" value={debug.hoverEmphasisEdgeCount} />
            <Metric label="mode" value={mode} />
            <Metric label="bound" value={`${bounds.shape} ${bounds.size || "auto"}`} />
            <Metric label="avg degree" value={formatNumber(stats.averageDegree, 2)} />
            <Metric
              label="point avg"
              value={formatNumber(debug.pointSizeStats.effectiveAvg, 2)}
            />
            <Metric
              label="point max"
              value={formatNumber(debug.pointSizeStats.effectiveMax, 2)}
            />
            <Metric
              label="link/point"
              value={formatNumber(debug.pointSizeStats.linkDistanceToEffectiveAvg, 2)}
            />
            <Metric
              label="line width"
              value={formatNumber(edgeRenderParams.lineWidthScale, 2)}
            />
            <Metric label="engine" value={engineStatus} />
          </div>
        </section>

        <section className="graph-lab-section">
          <h2>Wire feed</h2>
          <div className="graph-lab-metrics">
            <Metric label="wire nodes" value={rawSummary?.nodes ?? 0} />
            <Metric label="wire edges" value={rawSummary?.edges ?? 0} />
            <Metric label="meta edges" value={rawSummary?.metaEdges ?? 0} />
            <Metric label="displayed edges" value={stats.totalEdges} />
          </div>
        </section>

        <Distribution title="Node kinds" values={stats.kinds} />
        <Distribution
          title={`Document types (${stats.totalDocs} total)`}
          values={stats.docTypes}
        />
        <Distribution title="Edge tiers" values={stats.tiers} />
        <Distribution title="Relations" values={stats.relations} />

        <section className="graph-lab-section">
          <h2>Mode and camera</h2>
          <div className="graph-lab-row">
            <select
              value={mode}
              onChange={(event) => applyMode(event.target.value as RepresentationMode)}
            >
              {REPRESENTATION_MODES.map((entry) => (
                <option value={entry} key={entry}>
                  {entry}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => scene.controller.command({ kind: "reset-view" })}
            >
              Reset
            </button>
            <button type="button" onClick={togglePaused}>
              {paused ? "Start" : "Pause"}
            </button>
          </div>
        </section>

        <section className="graph-lab-section">
          <h2>Bounds</h2>
          <div className="graph-lab-row">
            <select
              value={bounds.shape}
              onChange={(event) =>
                applyBounds({ shape: event.target.value as typeof bounds.shape })
              }
            >
              <option value="free">free</option>
              <option value="circle">circle</option>
            </select>
            <label>
              size
              <input
                type="number"
                value={bounds.size}
                min={0}
                step={50}
                onChange={(event) =>
                  applyBounds({
                    size: numberFromInput(event.target.value, bounds.size),
                  })
                }
              />
            </label>
          </div>
        </section>

        <section className="graph-lab-section">
          <h2>Cosmos simulation</h2>
          <div className="graph-lab-force-effects">
            {FORCE_EFFECTS.map((force) => (
              <div className="graph-lab-force-card" key={force.key}>
                <div>
                  <strong>{force.label}</strong>
                  <span>{force.effect}</span>
                </div>
                <code>
                  {formatNumber(cosmosConfig[force.key], 3)} {force.unit}
                </code>
              </div>
            ))}
          </div>
          {COSMOS_CONTROLS.map((control) => (
            <label className="graph-lab-control" key={control.key}>
              <span>{control.label}</span>
              <input
                type="range"
                min={control.min ?? 0}
                max={control.max ?? 1}
                step={control.step}
                value={cosmosConfig[control.key]}
                onChange={(event) =>
                  applyCosmosConfig({
                    [control.key]: numberFromInput(
                      event.target.value,
                      cosmosConfig[control.key],
                    ),
                  } as Partial<CosmosSimulationConfig>)
                }
              />
              <input
                type="number"
                value={cosmosConfig[control.key]}
                step={control.step}
                onChange={(event) =>
                  applyCosmosConfig({
                    [control.key]: numberFromInput(
                      event.target.value,
                      cosmosConfig[control.key],
                    ),
                  } as Partial<CosmosSimulationConfig>)
                }
              />
            </label>
          ))}
          <button
            type="button"
            onClick={() => applyCosmosConfig(COSMOS_SIMULATION_DEFAULTS)}
          >
            Reset Cosmos config
          </button>
        </section>

        <section className="graph-lab-section">
          <h2>Edge rendering</h2>
          <label className="graph-lab-control">
            <span>Line width</span>
            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={edgeRenderParams.lineWidthScale}
              onChange={(event) =>
                applyEdgeRender({
                  lineWidthScale: numberFromInput(
                    event.target.value,
                    edgeRenderParams.lineWidthScale,
                  ),
                })
              }
            />
            <input
              type="number"
              step={0.05}
              value={edgeRenderParams.lineWidthScale}
              onChange={(event) =>
                applyEdgeRender({
                  lineWidthScale: numberFromInput(
                    event.target.value,
                    edgeRenderParams.lineWidthScale,
                  ),
                })
              }
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setEdgeRenderParams({ ...EDGE_RENDER_DEFAULTS });
              scene.controller.command({
                kind: "set-edge-render-params",
                params: EDGE_RENDER_DEFAULTS,
              });
            }}
          >
            Reset edge rendering
          </button>
        </section>

        <section className="graph-lab-section">
          <h2>Simulation internals</h2>
          <div className="graph-lab-metrics">
            <Metric label="state" value={simulationStatus} />
            <Metric label="active" value={simulationActive ? "yes" : "no"} />
            <Metric
              label="alpha"
              value={formatNumber(debug.simulationState?.alpha ?? 0, 4)}
            />
            <Metric label="browser fps" value={formatNumber(perf.fps, 0)} />
            <Metric label="avg frame" value={`${formatNumber(perf.frameMs)} ms`} />
            <Metric label="max frame" value={`${formatNumber(perf.maxFrameMs)} ms`} />
          </div>
        </section>

        <section className="graph-lab-section">
          <h2>Renderer snapshot</h2>
          <button
            type="button"
            onClick={() =>
              setSamplePoints(scene.field.debugSnapshot({ includePoints: 8 }).points)
            }
          >
            Read 8 points
          </button>
          <pre>
            {JSON.stringify(
              {
                pointCount: debug.pointCount,
                rendererLifecycle: debug.rendererLifecycle,
                rendererLifecycleAgeMs: debug.rendererLifecycleAgeMs,
                rendererLifecycleSeq: debug.rendererLifecycleSeq,
                rendererPriming: debug.rendererPriming,
                rendererLifecycleTrace: debug.rendererLifecycleTrace,
                pendingSimulationStart: debug.pendingSimulationStart,
                selectedIds: debug.selectedIds,
                hoveredId: debug.hoveredId,
                hoverEmphasisIds: debug.hoverEmphasisIds,
                hoverEmphasisEdgeCount: debug.hoverEmphasisEdgeCount,
                bounds: debug.bounds,
                droppedEdges: debug.droppedEdges,
                edgeRender: debug.edgeRender,
                simulationState: debug.simulationState,
                cosmosConfig: debug.cosmosConfig,
                pointSizeStats: debug.pointSizeStats,
                points: samplePoints,
              },
              null,
              2,
            )}
          </pre>
        </section>
      </aside>
    </main>
  );
}
