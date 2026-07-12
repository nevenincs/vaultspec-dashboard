// Decomposed from engine.ts (module-decomposition mandate, 2026-07-12).

import {
  adaptCodeFiles,
  adaptContent,
  adaptDashboardState,
  adaptFileTree,
  adaptFilters,
  adaptGitOp,
  adaptGraphEmbeddings,
  adaptGraphSlice,
  adaptHistory,
  adaptIssues,
  adaptLineageSlice,
  adaptMap,
  adaptNodeDetail,
  adaptNodeEvidence,
  adaptPipeline,
  adaptPlanInterior,
  adaptPrs,
  adaptSearch,
  adaptSession,
  adaptSettings,
  adaptSettingsSchema,
  adaptStatus,
  adaptVaultTree,
  adaptWorkspaces,
  unwrapEnvelope,
} from "../liveAdapters";
import { reportDrainProgress, settleDrainProgress } from "../drainProgress";
import { EngineError } from "./tiers";
import type { TiersBlock } from "./tiers";
import type {
  CodeFilesResponse,
  ContentResponse,
  DashboardState,
  DashboardStatePatch,
  EmbeddingsResponse,
  FileTreeResponse,
  FiltersVocabulary,
  GraphCorpus,
  GraphFilter,
  GraphSlice,
  MapResponse,
  NodeDetail,
  NodeEvidence,
  SalienceLens,
  VaultTreeResponse,
  WorkspacesState,
} from "./graphTypes";
import type {
  EventsResponse,
  GraphAsofResponse,
  GraphDiffResponse,
  HistoryResponse,
  IssuesResponse,
  LineageSlice,
  PRsResponse,
} from "./temporalTypes";
import type {
  EngineStatus,
  GitOpResponse,
  OpsArchiveBody,
  OpsAutofixBody,
  OpsResult,
  PipelineResponse,
  PlanInteriorResponse,
  ProvisionJob,
  ProvisionRunBody,
  ProvisionStatus,
  SearchResponse,
  SessionState,
  SessionUpdate,
  SettingUpdate,
  SettingsSchema,
  SettingsState,
} from "./statusTypes";

// In development Vite proxies /api to the engine (vite.config.ts); in
// production the SPA is served by the engine itself, so the API shares the
// origin (contract §1) and the prefix collapses.
const API_BASE = import.meta.env.DEV ? "/api" : "";

// The files(code) provider narrows the listing CLIENT-SIDE, so — exactly like the
// vault tree — it must hold the COMPLETE set or a file beyond the first page can
// never match. The route serves a memoized, filter-independent projection
// paginated at `<= CODE_FILES_PAGE_SIZE`/page, so `codeFiles` walks the cursor to
// completion. The page cap bounds the walk (bounded-by-default): 25 × 2000 =
// 50,000 covers the engine's whole 50k source-file walk ceiling in one drain.
const CODE_FILES_PAGE_SIZE = 2000;
const CODE_FILES_MAX_PAGES = 25;

// The rail narrows the vault tree CLIENT-SIDE (`narrowVaultRailEntries`), so it
// must hold the COMPLETE listing or a feature whose documents fall beyond the
// first page can never match (it would narrow the loaded slice to nothing — the
// `node-facets-filter-on-the-engine` ceiling gate, manifest in the rail). The
// route serves a memoized, filter-independent doc-row projection paginated at
// `<= VAULT_TREE_PAGE_SIZE`/page, so `vaultTree` walks the cursor to completion.
// The page is the route's sanctioned maximum; the page cap bounds the walk
// (bounded-by-default-for-every-accumulator) so a pathological corpus cannot
// spin the loop unboundedly.
//
// The FIRST page is deliberately small (universal-data-loading ADR D5,
// first-page-first): the cold-load rail paints after ~a couple hundred rows
// instead of buffering the route max, and the progressive `complete:false`
// partial path engages on ordinary corpora too — with a 2000-row first page,
// any vault under 2000 documents loaded as one monolithic response and the
// progressive render never fired. Subsequent pages use the route max so the
// drain still finishes in few round-trips; the cap covers the same 50k total.
const VAULT_TREE_FIRST_PAGE_SIZE = 200;
const VAULT_TREE_PAGE_SIZE = 2000;
const VAULT_TREE_MAX_PAGES = 26;
// Brief yield between continuation pages (on-demand-cold-start ADR D3) so the
// background drain never contends with first paint / first interaction; the
// page cap still bounds the loop, so total added latency is bounded too.
const VAULT_TREE_PAGE_YIELD_MS = 120;

function drainYield(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build an EngineError from a non-ok response, preserving the tiers block the
 * engine attaches to its error envelope (contract §2 /
 * every-wire-response-carries-the-tiers-block). The transport must never
 * discard the degradation truth: a down backend has to reach the client as a
 * degraded state, not a bare failure. A body that is missing or unparseable
 * (a genuine transport fault) yields an EngineError with no tiers.
 */
async function engineErrorFrom(path: string, response: Response): Promise<EngineError> {
  let body: unknown;
  let tiers: TiersBlock | undefined;
  try {
    body = unwrapEnvelope(await response.json());
    if (body && typeof body === "object" && "tiers" in body) {
      const candidate = (body as { tiers?: unknown }).tiers;
      if (candidate && typeof candidate === "object") {
        tiers = candidate as TiersBlock;
      }
    }
  } catch {
    // No structured JSON body — nothing to preserve.
  }
  return new EngineError(path, response.status, { tiers, body });
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
   * Swap the transport at runtime. The app always talks to the live engine; the
   * test harness uses this to point the app-wide client at the spawned
   * `vaultspec serve` over its loopback origin (testing/liveSetup).
   */
  useTransport(fetchImpl: FetchLike): void {
    this.fetchImpl = fetchImpl;
  }

  // §3
  async map(): Promise<MapResponse> {
    return adaptMap(await this.get("/map"));
  }

  /** The workspace registry (dashboard-workspace-registry ADR): the registered
   *  project roots with reachability plus the active-workspace id. */
  async workspaces(): Promise<WorkspacesState> {
    return adaptWorkspaces(await this.get("/workspaces"));
  }

  async vaultTree(
    scope: string,
    onPartial?: (partial: VaultTreeResponse) => void,
  ): Promise<VaultTreeResponse> {
    // Walk the cursor to completion so the rail holds the WHOLE listing — the
    // tree filters client-side, so a partial first page silently drops every
    // feature whose documents sit beyond it (the rail's filter-shows-nothing
    // bug). Each page is the route's max; the page cap bounds the walk. Each
    // page reports into the drain-progress seam (universal-data-loading ADR
    // D3) so the multi-page walk is visible to the activity indicator; the
    // entry is dropped on settle or error either way. `onPartial` (ADR D5)
    // hands each accumulated prefix out with `complete: false` so the rail
    // can render the first page immediately while the drain continues; the
    // resolved value is the whole listing with `complete: true`.
    const drainId = `vault-tree:${scope}`;
    const entries: unknown[] = [];
    let tiers: unknown = {};
    let cursor: string | undefined;
    try {
      for (let page = 0; page < VAULT_TREE_MAX_PAGES; page += 1) {
        const body = await this.get<{
          entries?: unknown[];
          tiers?: unknown;
          next_cursor?: string;
        }>("/vault-tree", {
          scope,
          page_size: page === 0 ? VAULT_TREE_FIRST_PAGE_SIZE : VAULT_TREE_PAGE_SIZE,
          cursor,
        });
        if (Array.isArray(body.entries)) entries.push(...body.entries);
        if (body.tiers !== undefined) tiers = body.tiers;
        cursor = typeof body.next_cursor === "string" ? body.next_cursor : undefined;
        if (cursor === undefined) break;
        reportDrainProgress(drainId, page + 1, entries.length);
        onPartial?.({
          ...adaptVaultTree({ entries: [...entries], tiers }),
          complete: false,
        });
        await drainYield(VAULT_TREE_PAGE_YIELD_MS);
      }
    } finally {
      settleDrainProgress(drainId);
    }
    return { ...adaptVaultTree({ entries, tiers }), complete: true };
  }

  async codeFiles(scope: string): Promise<CodeFilesResponse> {
    // Walk the cursor to completion so the files(code) provider holds the WHOLE
    // listing — it narrows client-side, so a partial first page silently drops
    // every file beyond it. Each page is the route's max; the page cap bounds
    // the walk. The walk-cap `truncated` block is generation-stable (identical
    // on every page), so the last-seen value is the honest whole-listing truth.
    const drainId = `code-files:${scope}`;
    const entries: unknown[] = [];
    let tiers: unknown = {};
    let truncated: unknown = null;
    let cursor: string | undefined;
    try {
      for (let page = 0; page < CODE_FILES_MAX_PAGES; page += 1) {
        const body = await this.get<{
          entries?: unknown[];
          tiers?: unknown;
          truncated?: unknown;
          next_cursor?: string;
        }>("/code-files", { scope, page_size: CODE_FILES_PAGE_SIZE, cursor });
        if (Array.isArray(body.entries)) entries.push(...body.entries);
        if (body.tiers !== undefined) tiers = body.tiers;
        if (body.truncated !== undefined) truncated = body.truncated;
        cursor = typeof body.next_cursor === "string" ? body.next_cursor : undefined;
        if (cursor === undefined) break;
        // Report only while another page remains (universal-data-loading ADR
        // D3): the common single-page listing never touches the drain slice,
        // so small corpora cannot flicker the indicator.
        reportDrainProgress(drainId, page + 1, entries.length);
      }
    } finally {
      settleDrainProgress(drainId);
    }
    // The CLIENT walk cap is ALSO truncation: if the page loop exhausted its
    // bound while a cursor still remained, files beyond it never loaded — an
    // incomplete listing exactly like the engine's own walk cap. Surface it (when
    // the server did not already report truncation) so the provider and palette
    // can be honest rather than silently partial.
    if (truncated === null && cursor !== undefined) {
      truncated = {
        returned_files: entries.length,
        reason:
          "client page-walk cap: the listing stopped at its page ceiling; files beyond it are absent",
      };
    }
    return adaptCodeFiles({ entries, tiers, truncated });
  }

  /** One bounded, ignore-aware directory level of the worktree file tree
   *  (dashboard-code-tree ADR): metadata only (no bytes), `path` defaults to the
   *  worktree root, `cursor` resumes a paginated level, `page_size` clamps a
   *  level. Each child carries the shared `code:<path>` interlink node id. */
  async fileTree(params: {
    scope: string;
    path?: string;
    cursor?: string;
    page_size?: number;
  }): Promise<FileTreeResponse> {
    return adaptFileTree(
      await this.get("/file-tree", {
        scope: params.scope,
        path: params.path,
        cursor: params.cursor,
        page_size: params.page_size,
      }),
    );
  }

  // §4
  async graphQuery(body: {
    scope: string;
    filter?: GraphFilter;
    /** Engine-owned granularity (contract §4): document edges, or
     *  feature-convergence nodes + meta-edges. Omitted = document. */
    granularity?: "document" | "feature";
    as_of?: string | number;
    /**
     * The active salience lens (graph-node-salience ADR §4 amendment): a request
     * parameter selecting which per-lens importance field the engine computes
     * and — via DOI — which node set is served. `status` (default) or `design`;
     * omitted = the engine defaults to status. Switching lens is a re-query the
     * stores layer issues. The representation layer drives this from its
     * active-lens view state.
     */
    lens?: SalienceLens;
    /** The DOI focus node id folded into the salience distance term. */
    focus?: string | null;
    /** The active graph corpus (codebase-graphing ADR D5/D7): `vault` (default,
     *  absent = byte-identical to the pre-corpus contract) or `code` — the
     *  DISCONNECTED code graph. */
    corpus?: GraphCorpus;
    /** CODE-corpus narrowing (ADR D5): keep only nodes under this repo-relative
     *  directory prefix. Rejected by the engine on the vault corpus. */
    dir_prefix?: string;
    /** CODE-corpus narrowing: language wire tokens. Rejected on the vault corpus. */
    languages?: string[];
  }): Promise<GraphSlice> {
    // The code corpus is a DIFFERENT dataset (ADR D1): its `code:` file nodes
    // are legitimate here, so the adapter's vault-only code-node exclusion
    // must NOT fire. Tell the adapter which corpus it is adapting.
    return adaptGraphSlice(await this.post("/graph/query", body), {
      corpus: body.corpus ?? "vault",
    });
  }

  /**
   * The dedicated bounded embedding read (graph-semantic-embeddings ADR D2):
   * rag's stored dense vectors for the SERVED document node set, fetched LAZILY
   * only on entering semantic mode and cached per generation (the stores hook
   * owns the laziness). `lens`/`focus` keep the embedding set aligned with
   * `/graph/query`'s DOI-ordered served node set. NEVER inline on `/graph/query`
   * — the default constellation path pays no embedding tax. The tolerant adapter
   * reconciles the wire shape; the stores layer reads semantic availability from
   * the `tiers` block (ADR D7), never a bare transport error.
   */
  async graphEmbeddings(params: {
    scope: string;
    lens?: SalienceLens;
    focus?: string | null;
  }): Promise<EmbeddingsResponse> {
    return adaptGraphEmbeddings(
      await this.get("/graph/embeddings", {
        scope: params.scope,
        lens: params.lens,
        focus: params.focus ?? undefined,
      }),
    );
  }

  async filters(scope: string, corpus?: "vault" | "code"): Promise<FiltersVocabulary> {
    // The vocabulary is per-corpus (codebase-graphing ADR D5): the code corpus
    // serves languages/dirs plus its mtime date span (code-timeline-range ADR).
    // The vault request stays byte-identical (no corpus param).
    return adaptFilters(
      await this.get("/filters", corpus === "code" ? { scope, corpus } : { scope }),
    );
  }

  async dashboardState(scope: string, signal?: AbortSignal): Promise<DashboardState> {
    return adaptDashboardState(await this.get("/dashboard-state", { scope }, signal));
  }

  async patchDashboardState(body: DashboardStatePatch): Promise<DashboardState> {
    const state = adaptDashboardState(await this.patch("/dashboard-state", body));
    return body.graph_bounds === undefined
      ? state
      : { ...state, graph_bounds: body.graph_bounds };
  }

  /** The in-flight pipeline projection (dashboard-pipeline-wire W02): active
   *  plans + in-flight ADRs in scope. */
  async pipeline(scope: string): Promise<PipelineResponse> {
    return adaptPipeline(await this.get("/pipeline", { scope }));
  }

  async node(id: string, scope?: string): Promise<NodeDetail> {
    return adaptNodeDetail(
      await this.get(`/nodes/${encodeURIComponent(id)}`, { scope }),
    );
  }

  /** The read-only, bounded content fetch (review-rail-viewers ADR): the bytes of
   *  the document or source file the node id names, keyed on the stable id
   *  (`doc:<stem>` / `code:<path>`). The id is `encodeURIComponent`-encoded so a
   *  `code:<path>` id's slashes stay one path segment. `scope` is optional (absent
   *  = the active scope, the nodes-family convention). The tolerant adapter
   *  reconciles the wire shape; the viewers read the `tiers` block for degraded
   *  state. */
  async content(id: string, scope?: string): Promise<ContentResponse> {
    return adaptContent(
      await this.get(`/nodes/${encodeURIComponent(id)}/content`, { scope }),
    );
  }

  nodeNeighbors(
    id: string,
    params: { depth?: number; tiers?: string; scope?: string } = {},
  ): Promise<GraphSlice> {
    return this.get(`/nodes/${encodeURIComponent(id)}/neighbors`, params);
  }

  async nodeEvidence(id: string, scope?: string): Promise<NodeEvidence> {
    // The /evidence route is consumed through its tolerant adapter (the same
    // one-code-path discipline as every other /nodes route): the engine serde OMITS
    // an empty evidence array, so adaptNodeEvidence floors documents/code_locations/
    // commits to [] — otherwise the pure fold reads `.length` of undefined and crashes
    // the stage panel on hover/select.
    return adaptNodeEvidence(
      await this.get(`/nodes/${encodeURIComponent(id)}/evidence`, { scope }),
    );
  }

  /** The bounded plan-container interior of a plan node (dashboard-pipeline-wire
   *  W03): the wave/phase/step tree under a node ceiling. */
  async planInterior(id: string, scope?: string): Promise<PlanInteriorResponse> {
    return adaptPlanInterior(
      await this.get(`/nodes/${encodeURIComponent(id)}/plan-interior`, { scope }),
    );
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

  /** The bounded, read-only recent-commit history (status-overview ADR): the
   *  last N commits with subjects for a scope, newest-first. `limit` is optional
   *  (the engine defaults to ~20 and clamps a large value to a hard ceiling). The
   *  tolerant adapter reconciles the wire shape; the rail reads degraded state
   *  from the `tiers` block. */
  async history(params: {
    scope: string;
    limit?: number;
    cursor?: string;
  }): Promise<HistoryResponse> {
    return adaptHistory(await this.get("/history", params));
  }

  /** Open or recently-merged pull requests for a scope (status-rail redesign),
   *  brokered engine-side through the bounded `gh` CLI. `state` is `open`
   *  (default) or `merged`; the tolerant adapter reconciles the wire shape and
   *  carries the capability-local `available`/`reason` the rail degrades on. */
  async prs(params: {
    scope: string;
    state?: "open" | "merged";
    limit?: number;
  }): Promise<PRsResponse> {
    return adaptPrs(await this.get("/prs", params));
  }

  /** Open (or closed) issues for a scope (status-rail redesign), brokered
   *  engine-side through the bounded `gh` CLI; tolerant adapter, capability-local
   *  `available`/`reason`. */
  async issues(params: {
    scope: string;
    state?: "open" | "closed";
    limit?: number;
  }): Promise<IssuesResponse> {
    return adaptIssues(await this.get("/issues", params));
  }

  /** The bounded temporal-lineage projection (dashboard-timeline ADR, contract
   *  §5): for a scope and an inclusive `[from, to]` ISO `yyyy-mm-dd` date range
   *  (either bound optional/open), the dated document nodes in range plus the
   *  self-consistent edges among them. `filter` is the engine-owned wire filter
   *  as a URL-encoded JSON string, exactly as `/graph/lineage` accepts it (the
   *  same grammar `/graph/query` uses). Built and unwrapped through the same
   *  client path as `events`/`graphQuery`; the tolerant adapter reconciles the
   *  slice shape. */
  async lineage(params: {
    scope: string;
    from?: string;
    to?: string;
    filter?: string;
    /** Optional as-of time-travel token (ts | sha | ref) — when present the engine
     *  serves BLOB-TRUE lineage as it existed at T (dashboard-timeline ADR fast-
     *  follow). Absent = lineage over the live graph. */
    t?: string;
  }): Promise<LineageSlice> {
    return adaptLineageSlice(await this.get("/graph/lineage", params));
  }

  graphAsof(params: {
    scope: string;
    t: string | number;
    filter?: string;
  }): Promise<GraphAsofResponse> {
    // NB: the constellation-granularity shape of the time-travel surface is
    // the open S50 asof/diff divergence question (routed to team-lead); this
    // method intentionally stays on the document-granularity path the GUI
    // already consumes, untouched by the meta-edge fold.
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

  /** A feature-archive op: `POST /ops/core/archive` forwards
   *  `vaultspec-core vault feature archive <tag>`. The engine validates/bounds the
   *  feature token and forwards core's envelope VERBATIM under `data.envelope` with
   *  the tiers block (engine-read-and-infer); HTTP 200 for both a success and a
   *  business refusal (e.g. unknown tag), the caller branching on the envelope.
   *  RETAINED (ledgered-edit-migration ADR): a multi-document vault-maintenance
   *  op, not a document edit — stays on this brokered seam, never ledgered. */
  opsCoreArchive(body: OpsArchiveBody): Promise<OpsResult> {
    return this.post("/ops/core/archive", body);
  }

  /** A conformance-autofix op: `POST /ops/core/autofix` forwards
   *  `vault check all --fix --feature <tag>`. Feature-scoped (the only fix grain
   *  the sibling exposes); the engine validates/bounds the feature token and
   *  forwards core's envelope verbatim under `data.envelope`. RETAINED
   *  (ledgered-edit-migration ADR): a bulk vault-maintenance op with no single
   *  target, not a document edit — stays on this brokered seam, never ledgered. */
  opsCoreAutofix(body: OpsAutofixBody): Promise<OpsResult> {
    return this.post("/ops/core/autofix", body);
  }

  /** The brokered rag READ verbs (rag-control-plane ADR D2): a GET against the
   *  one `/ops/rag/{verb}` namespace (service-state, jobs, watcher, projects,
   *  readiness, logs, metrics). rag's envelope is forwarded VERBATIM under
   *  `data.envelope` with the tiers block, so the unwrapped result is
   *  `{envelope, tiers}`. The control plane reads degraded state from `tiers`,
   *  never a transport error (degradation-is-read-from-tiers). */
  opsRagGet<T = unknown>(
    verb: string,
    params?: Record<string, string | number | undefined>,
    signal?: AbortSignal,
  ): Promise<{ envelope: T | null; tiers: TiersBlock }> {
    return this.get(`/ops/rag/${encodeURIComponent(verb)}`, params, signal);
  }

  /** The framework provisioning plane (project-provisioning ADR D2): the served
   *  status projection of a registry-resolved target — git / uv / core+rag tool
   *  versions vs floors / framework install state / vault presence / pending
   *  migrations / rag enrollment. Backend-served truth the panel renders without
   *  inventing semantics; unwrapped to the `data` projection. */
  provisionStatus(
    params: { workspace?: string; worktree?: string } = {},
    signal?: AbortSignal,
  ): Promise<ProvisionStatus> {
    return this.get("/provision/status", params, signal);
  }

  /** Start a provisioning capability (install / upgrade / migrate / acquire) as a
   *  bounded, single-flight JOB (ADR D3/D4): returns the job envelope + whether
   *  the request ATTACHED to an already-running job for the same target. A force
   *  install must carry `confirm: "confirm-force"` or the engine refuses it. */
  provisionRun(
    body: ProvisionRunBody,
  ): Promise<{ job: ProvisionJob; attached: boolean }> {
    return this.post("/provision/run", body);
  }

  /** Poll one provisioning job by id (ADR D4). A reclaimed/unknown id is a 404
   *  the caller surfaces as "job expired". */
  provisionJob(id: string, signal?: AbortSignal): Promise<{ job: ProvisionJob }> {
    return this.get(`/provision/jobs/${encodeURIComponent(id)}`, undefined, signal);
  }

  /** The read-only git pass-through (dashboard-pipeline-wire W04; historical diff
   *  figma-parity-reconciliation S14): a whitelisted read-only git verb
   *  (`status` | `numstat` | `diff` | `histdiff`), git output forwarded verbatim.
   *  The `diff` verb requires a `path`; `histdiff` requires `path` plus the
   *  `from`/`to` revs of the two-rev historical diff; `status`/`numstat` take
   *  none. */
  async opsGit(
    verb: "status" | "numstat" | "diff" | "histdiff",
    body: { scope?: string; path?: string; from?: string; to?: string } = {},
  ): Promise<GitOpResponse> {
    return adaptGitOp(await this.post(`/ops/git/${encodeURIComponent(verb)}`, body));
  }

  /** §7 — open the multiplexed SSE stream through the same transport. The
   *  optional `scope` targets a specific worktree's clock (W02.P04.S14 wire
   *  change): resume runs against that scope's own monotonic seq; absent, the
   *  engine falls back to the active scope. */
  openStream(
    channels: string[],
    since?: number,
    signal?: AbortSignal,
    scope?: string,
  ): Promise<Response> {
    return this.fetchImpl(this.streamUrl(channels, since, scope), { signal });
  }

  // §7 — the SSE endpoint URL; consumption lives in queries.ts (S20).
  streamUrl(channels: string[], since?: number, scope?: string): string {
    const params = new URLSearchParams({ channels: channels.join(",") });
    if (since !== undefined) params.set("since", String(since));
    // Per-scope resume (W02.P04.S14): pass the scope so `since=` resumes against
    // that scope's own clock. Absent, the engine streams the active scope.
    if (scope !== undefined) params.set("scope", scope);
    return `${this.baseUrl}/stream?${params.toString()}`;
  }

  // §8
  async search(
    body: {
      scope?: string;
      query: string;
      target?: "vault" | "code";
      filters?: Record<string, string>;
      /** App-chosen result bound → rag's `top_k` (ADR D5); the engine rejects a
       *  value above its `MAX_SEARCH_RESULTS` ceiling. */
      max_results?: number;
    },
    signal?: AbortSignal,
  ): Promise<SearchResponse> {
    // The engine's `SearchBody` reads the corpus target from the wire field
    // `type` (`#[serde(rename = "type")]`, rag's own vocabulary), NOT `target`.
    // Serialize it as `type` so the engine actually receives the corpus — a
    // `target` key is silently dropped and the search defaults to the vault
    // corpus (the code target then never reaches rag).
    const { target, ...rest } = body;
    const wire = target === undefined ? rest : { ...rest, type: target };
    return adaptSearch(await this.post("/search", wire, signal)) as SearchResponse;
  }

  // --- session / settings (W04.P08.S25) ------------------------------------

  /** Read the current session — the "where am I" state restored on load. */
  async session(): Promise<SessionState> {
    return adaptSession(await this.get("/session"));
  }

  /** Persist a partial session update; returns the full updated session. An
   *  unknown `active_scope` throws an EngineError (tiered 400). */
  async putSession(body: SessionUpdate): Promise<SessionState> {
    return adaptSession(await this.put("/session", body));
  }

  /** Read user settings (global + per-scope scoped keys). */
  async settings(): Promise<SettingsState> {
    return adaptSettings(await this.get("/settings"));
  }

  /** Persist a single settings write; returns the full updated settings. A
   *  rejected write (unknown key / bad value / scope-not-allowed) throws an
   *  EngineError whose `errorKind` names the typed reason. */
  async putSettings(body: SettingUpdate): Promise<SettingsState> {
    return adaptSettings(await this.put("/settings", body));
  }

  /** Read the engine-owned settings schema registry — the single source of
   *  truth the client renders controls and synthesizes defaults from. */
  async settingsSchema(): Promise<SettingsSchema> {
    return adaptSettingsSchema(await this.get("/settings/schema"));
  }

  // --- transport -----------------------------------------------------------

  private async get<T>(
    path: string,
    params?: Record<string, string | number | undefined>,
    signal?: AbortSignal,
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
    const response = await this.fetchImpl(url, signal ? { signal } : undefined);
    if (!response.ok) throw await engineErrorFrom(path, response);
    return unwrapEnvelope(await response.json()) as T;
  }

  private async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) throw await engineErrorFrom(path, response);
    return unwrapEnvelope(await response.json()) as T;
  }

  private async put<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await engineErrorFrom(path, response);
    return unwrapEnvelope(await response.json()) as T;
  }

  private async patch<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await engineErrorFrom(path, response);
    return unwrapEnvelope(await response.json()) as T;
  }
}

/** The app-wide default client, bound to the live engine origin. */
export const engineClient = new EngineClient();
