// Typed engine API client (W02.P05.S17) — the single surface through which
// the GUI speaks to the engine, covering every contract query family: map,
// vault-tree, graph query, nodes, filters, events, asof, diff, status,
// search, ops. Capabilities are binding, endpoint shapes illustrative
// (contract status line); wire types stay snake_case as served.
//
// The same client runs against the W02.P05 mock engine and the live serve
// origin (W03.P12.S49 swaps the base URL behind the env flag) — passing
// unchanged against both IS the contract-shape verification.

import { useQuery } from "@tanstack/react-query";

import {
  adaptFilters,
  adaptMap,
  adaptSearch,
  adaptStatus,
  adaptVaultTree,
  unwrapEnvelope,
} from "./liveAdapters";

// In development Vite proxies /api to the engine (vite.config.ts); in
// production the SPA is served by the engine itself, so the API shares the
// origin (contract §1) and the prefix collapses.
const API_BASE = import.meta.env.DEV ? "/api" : "";

// --- cross-cutting contract shapes (§2) ----------------------------------------

/** Every response carries a per-tier degradation block — truthful absence. */
export type TiersBlock = Record<string, { available: boolean; reason?: string }>;

export class EngineError extends Error {
  readonly status: number;
  readonly path: string;
  constructor(path: string, status: number) {
    super(`engine ${path} responded ${status}`);
    this.path = path;
    this.status = status;
  }
}

// --- §3 workspace map / vault tree ----------------------------------------------

export interface MapWorktree {
  id: string;
  path: string;
  branch: string;
  has_vault: boolean;
  is_default?: boolean;
  degraded?: string[];
}

export interface MapRepository {
  path: string;
  branches: { name: string; kind: "default" | "feature" | "other" }[];
  worktrees: MapWorktree[];
}

export interface MapResponse {
  repositories: MapRepository[];
  tiers: TiersBlock;
}

export interface VaultTreeEntry {
  path: string;
  doc_type: string;
  feature_tags: string[];
  dates: { created?: string; modified?: string };
}

export interface VaultTreeResponse {
  entries: VaultTreeEntry[];
  tiers: TiersBlock;
}

// --- §4 graph shapes -------------------------------------------------------------

export interface EngineNode {
  id: string;
  kind: string;
  doc_type?: string;
  feature_tags?: string[];
  title?: string;
  dates?: { created?: string; modified?: string };
  lifecycle?: { state: string; progress?: { done: number; total: number } };
  degree_by_tier?: Partial<
    Record<"declared" | "structural" | "temporal" | "semantic", number>
  >;
}

export interface EngineEdge {
  id: string;
  src: string;
  dst: string;
  relation: string;
  // No direction field on the wire: direction is carried entirely by
  // src→dst ordering (contract §4 as amended by engine audit W03P10-602).
  tier: "declared" | "structural" | "temporal" | "semantic";
  confidence: number;
  state?: "resolved" | "stale" | "broken";
  provenance?: string;
  observed_at?: string;
  /** Constellation meta-edges only (engine-aggregated, §4). */
  meta?: { count: number; breakdown_by_tier: Record<string, number> };
}

/** The engine-owned filter object, echoed back normalized (§4). */
export interface GraphFilter {
  tiers?: Partial<Record<EngineEdge["tier"], boolean>>;
  min_confidence?: Partial<Record<"temporal" | "semantic", number>>;
  relations?: string[];
  structural_state?: ("resolved" | "stale" | "broken")[];
  kinds?: string[];
  doc_types?: string[];
  feature_tags?: string[];
  date_range?: { from?: string; to?: string };
  text?: string;
}

export interface GraphSlice {
  nodes: EngineNode[];
  edges: EngineEdge[];
  filter?: GraphFilter;
  tiers: TiersBlock;
}

export interface FiltersVocabulary {
  relations: string[];
  tiers: string[];
  doc_types: string[];
  feature_tags: string[];
  kinds: string[];
  date_bounds?: { from?: string; to?: string };
  tiers_block?: TiersBlock;
}

export interface NodeDetail {
  node: EngineNode;
  interior?: GraphSlice;
  tiers: TiersBlock;
}

export interface NodeEvidence {
  documents: { path: string; doc_type: string }[];
  code_locations: { path: string; symbol?: string; line?: number; state: string }[];
  commits: { sha: string; subject: string; rule?: string }[];
  tiers: TiersBlock;
}

export interface DiscoverResponse {
  candidates: EngineEdge[];
  tiers: TiersBlock;
}

// --- §5 temporal shapes ------------------------------------------------------------

export interface EngineEvent {
  id: string;
  ts: string;
  kind: string;
  ref: string;
  /** Bounded per contract §5: commit + doc ids + code ids capped at 20. */
  node_ids: string[];
  /** How many ids the cap dropped; 0/absent means the list is complete. */
  truncated_node_ids?: number;
}

export interface EventBucket {
  from: string;
  to: string;
  counts_by_kind: Record<string, number>;
}

export interface EventsResponse {
  events?: EngineEvent[];
  buckets?: EventBucket[];
  tiers: TiersBlock;
}

/** One delta entry — the single shape shared by /graph/diff and SSE graph. */
export interface GraphDeltaEntry {
  op: "add" | "remove" | "change";
  node?: EngineNode;
  edge?: EngineEdge;
  t: number;
  seq: number;
}

export interface GraphDiffResponse {
  deltas: GraphDeltaEntry[];
  last_seq: number;
  tiers: TiersBlock;
}

export interface GraphAsofResponse extends GraphSlice {
  t: number;
  seq: number;
}

// --- §6 status / ops ------------------------------------------------------------------

export interface EngineStatus {
  ok: boolean;
  nodes: number;
  edges: number;
  degradations: string[];
  tiers: TiersBlock;
  git?: { branch: string; ahead: number; behind: number; dirty: string[] };
  core?: { reachable: boolean; vault_health?: string };
  rag?: { service: string; watcher?: string; index?: string; jobs?: number };
}

export interface OpsResult {
  ok: boolean;
  envelope: unknown;
  tiers: TiersBlock;
}

// --- §8 search ---------------------------------------------------------------------------

export interface SearchResult {
  score: number;
  source: string;
  excerpt?: string;
  /** The engine's value-add: results click through into the graph. */
  node_id: string | null;
}

export interface SearchResponse {
  results: SearchResult[];
  tiers: TiersBlock;
}

// --- the client ------------------------------------------------------------------------------

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Production token bootstrap (DF-6 amendment): the engine injects a
 * `vaultspec-token` meta tag into the served index.html; the default
 * transport carries it as the bearer. In dev the Vite proxy injects the
 * header instead (vite.config.ts), so an absent tag is not an error.
 */
export function bearerToken(): string | null {
  if (typeof document === "undefined") return null;
  return (
    document.querySelector('meta[name="vaultspec-token"]')?.getAttribute("content") ??
    null
  );
}

const defaultTransport: FetchLike = (input, init) => {
  const token = bearerToken();
  if (!token) return fetch(input, init);
  const headers = new Headers(init?.headers);
  if (!headers.has("authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
};

export interface EngineClientOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export class EngineClient {
  readonly baseUrl: string;
  private fetchImpl: FetchLike;

  constructor(options: EngineClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? API_BASE;
    this.fetchImpl = options.fetchImpl ?? defaultTransport;
  }

  /**
   * Swap the transport at runtime — the app bootstrap installs the mock
   * engine here when `VITE_MOCK_ENGINE=1` (S19), and S49 swaps the live
   * origin back behind the same flag.
   */
  useTransport(fetchImpl: FetchLike): void {
    this.fetchImpl = fetchImpl;
  }

  // §3
  async map(): Promise<MapResponse> {
    return adaptMap(await this.get("/map"));
  }

  async vaultTree(scope: string): Promise<VaultTreeResponse> {
    return adaptVaultTree(await this.get("/vault-tree", { scope }));
  }

  // §4
  graphQuery(body: {
    scope: string;
    filter?: GraphFilter;
    as_of?: string | number;
  }): Promise<GraphSlice> {
    return this.post("/graph/query", body);
  }

  async filters(scope: string): Promise<FiltersVocabulary> {
    return adaptFilters(await this.get("/filters", { scope }));
  }

  node(id: string): Promise<NodeDetail> {
    return this.get(`/nodes/${encodeURIComponent(id)}`);
  }

  nodeNeighbors(
    id: string,
    params: { depth?: number; tiers?: string; scope?: string } = {},
  ): Promise<GraphSlice> {
    return this.get(`/nodes/${encodeURIComponent(id)}/neighbors`, params);
  }

  nodeEvidence(id: string): Promise<NodeEvidence> {
    return this.get(`/nodes/${encodeURIComponent(id)}/evidence`);
  }

  discover(id: string): Promise<DiscoverResponse> {
    return this.post(`/nodes/${encodeURIComponent(id)}/discover`, {});
  }

  // §5
  events(params: {
    scope: string;
    from?: string;
    to?: string;
    kinds?: string;
    bucket?: string;
  }): Promise<EventsResponse> {
    return this.get("/events", params);
  }

  graphAsof(params: {
    scope: string;
    t: string | number;
    filter?: string;
  }): Promise<GraphAsofResponse> {
    return this.get("/graph/asof", params);
  }

  graphDiff(params: {
    scope: string;
    from: string | number;
    to: string | number;
    filter?: string;
  }): Promise<GraphDiffResponse> {
    return this.get("/graph/diff", params);
  }

  // §6
  async status(): Promise<EngineStatus> {
    return adaptStatus(await this.get("/status"));
  }

  opsCore(verb: string, body: unknown = {}): Promise<OpsResult> {
    return this.post(`/ops/core/${encodeURIComponent(verb)}`, body);
  }

  opsRag(verb: string, body: unknown = {}): Promise<OpsResult> {
    return this.post(`/ops/rag/${encodeURIComponent(verb)}`, body);
  }

  /** §7 — open the multiplexed SSE stream through the same transport. */
  openStream(
    channels: string[],
    since?: number,
    signal?: AbortSignal,
  ): Promise<Response> {
    return this.fetchImpl(this.streamUrl(channels, since), { signal });
  }

  // §7 — the SSE endpoint URL; consumption lives in queries.ts (S20).
  streamUrl(channels: string[], since?: number): string {
    const params = new URLSearchParams({ channels: channels.join(",") });
    if (since !== undefined) params.set("since", String(since));
    return `${this.baseUrl}/stream?${params.toString()}`;
  }

  // §8
  async search(body: {
    query: string;
    target?: "vault" | "code";
    filters?: Record<string, string>;
  }): Promise<SearchResponse> {
    return adaptSearch(await this.post("/search", body)) as SearchResponse;
  }

  // --- transport -----------------------------------------------------------

  private async get<T>(
    path: string,
    params?: Record<string, string | number | undefined>,
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) search.set(key, String(value));
      }
      const qs = search.toString();
      if (qs) url += `?${qs}`;
    }
    const response = await this.fetchImpl(url);
    if (!response.ok) throw new EngineError(path, response.status);
    return unwrapEnvelope(await response.json()) as T;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new EngineError(path, response.status);
    return unwrapEnvelope(await response.json()) as T;
  }
}

/** The app-wide default client (mock vs live origin resolved in S49). */
export const engineClient = new EngineClient();

export async function fetchEngineStatus(): Promise<EngineStatus> {
  return engineClient.status();
}

/** The right rail's recovery snapshot; /stream deltas refine it later. */
export function useEngineStatus() {
  return useQuery({
    queryKey: ["engine", "status"],
    queryFn: fetchEngineStatus,
  });
}
