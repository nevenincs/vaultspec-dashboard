// The mock engine (W02.P05.S19) — serves the S18 fixture corpus through
// the same transport surface the live engine will serve, so the S17 client
// and everything above it run unchanged before the engine plan's serve
// wave lands. This phase is the cross-plan dependency fence.
//
// Faithfulness rules, from the contract:
// - every response carries a `tiers` degradation block (§2) — and the mock
//   exposes `degrade()` so the W03 degradation matrix is reachable;
// - diff entries and the `graph` SSE channel share one monotonic delta
//   clock (§5/§7): seq derives from the corpus event log, `since=` resumes
//   or implies a gap the client must re-keyframe over;
// - remove/change deltas carry the entity payload with id load-bearing
//   (the S06 canonical shape).
//
// Toggled by env flag: `VITE_MOCK_ENGINE=1` (read by the app bootstrap,
// which swaps the client transport; S49 swaps it back to the live origin).

import type {
  EngineEdge,
  EngineEvent,
  EngineNode,
  FetchLike,
  GraphDeltaEntry,
  SettingDef,
  TiersBlock,
  WireMetaEdge,
} from "../stores/server/engine";
import type { FixtureCorpus } from "./fixtures/corpus";
import { buildFixtureCorpus } from "./fixtures/corpus";

// The mock settings registry — a byte-for-byte mirror of the live
// `vaultspec_session::settings_schema` registry (mock-mirrors-live-wire-shape).
// The dialog and the schema hook run against this exactly as against live; a
// captured-live-sample parity test pins the agreement. Keep in lockstep with the
// Rust registry when settings are added.
const MOCK_SETTINGS_GROUPS = ["Appearance", "Graph"];

const MOCK_SETTINGS_REGISTRY: SettingDef[] = [
  {
    key: "theme",
    value_type: { type: "enum", members: ["system", "light", "dark", "high-contrast"] },
    default: "system",
    scope_eligible: false,
    control: "segmented",
    label: "Theme",
    description: "The dashboard color theme.",
    group: "Appearance",
    order: 1,
  },
  {
    key: "reduce_motion",
    value_type: { type: "bool" },
    default: "false",
    scope_eligible: false,
    control: "switch",
    label: "Reduce motion",
    description: "Minimise animation and transitions.",
    group: "Appearance",
    order: 2,
  },
  {
    key: "default_granularity",
    value_type: { type: "enum", members: ["feature", "document"] },
    default: "feature",
    scope_eligible: true,
    control: "segmented",
    label: "Default granularity",
    description: "The graph detail level on load.",
    group: "Graph",
    order: 1,
  },
  {
    key: "confidence_floor",
    value_type: { type: "integer", min: 0, max: 100 },
    default: "0",
    scope_eligible: false,
    control: "slider",
    label: "Confidence floor",
    description: "Hide inferred edges below this certainty.",
    group: "Graph",
    order: 2,
    step: 1,
    unit: "%",
  },
  {
    key: "label_filter",
    value_type: { type: "string", max_len: 200 },
    default: "",
    scope_eligible: false,
    control: "text",
    label: "Label filter",
    description: "Only show nodes whose stem matches.",
    group: "Graph",
    order: 3,
    placeholder: "type a stem…",
  },
];

/** Validate a settings write against the mock registry, mirroring the live
 *  `validate()` typed rejections. Returns the canonical stored string, or throws
 *  a {@link RouteError} carrying the typed `error_kind`. */
function mockValidateSetting(key: string, value: string, scoped: boolean): string {
  const def = MOCK_SETTINGS_REGISTRY.find((d) => d.key === key);
  if (!def) throw new RouteError(400, `unknown setting key \`${key}\``, "unknown_key");
  if (scoped && !def.scope_eligible) {
    throw new RouteError(
      400,
      `setting \`${key}\` is global-only and cannot be scoped`,
      "scope_not_allowed",
    );
  }
  const vt = def.value_type;
  const bad = (reason: string): never => {
    throw new RouteError(
      400,
      `invalid value for \`${key}\`: ${reason}`,
      "invalid_value",
    );
  };
  switch (vt.type) {
    case "enum":
      if (!vt.members.includes(value)) bad(`must be one of: ${vt.members.join(", ")}`);
      return value;
    case "bool":
      if (value !== "true" && value !== "false") bad('must be "true" or "false"');
      return value;
    case "string":
      if (value.length > vt.max_len) bad(`must be at most ${vt.max_len} characters`);
      return value;
    case "integer": {
      // Strict decimal-integer match, mirroring the live `value.parse::<i64>()`
      // (rejects empty, whitespace, hex, floats) — mock-mirrors-live-wire-shape.
      if (!/^-?\d+$/.test(value)) bad("must be an integer");
      const n = Number(value);
      if (n < vt.min || n > vt.max) bad(`must be between ${vt.min} and ${vt.max}`);
      return String(n);
    }
  }
}

export const MOCK_SCOPE = "wt-main";

/** The workspace key the session/settings store rows hang under — one workspace,
 *  one key, matching the live route's `workspace_key` (the launch root token). */
export const MOCK_WORKSPACE = "/repo";

/** The vault-bearing worktree tokens the live multi-scope registry accepts as
 *  selectable scopes (W02.P04.S15 retarget): scoped reads serve any of these,
 *  not one frozen scope. `wt-bare` has no vault and is NOT selectable. */
const VAULT_BEARING_SCOPES = new Set([MOCK_SCOPE]);

export function isMockEngineEnabled(): boolean {
  return import.meta.env.VITE_MOCK_ENGINE === "1";
}

// --- session / settings in-memory state (user-state-persistence W04.P08.S27) ----
//
// The mock mirrors the live `vaultspec-session`-backed store byte-for-byte: a
// per-scope folder + feature-tag context, workspace recents, global settings,
// and per-scope scoped settings. Best-effort, in-memory only — exactly the shape
// the live `{data, tiers}`-enveloped session/settings routes serve.

interface MockScopeContext {
  folder: string | null;
  feature_tags: string[];
}

/** One registered project root in the mock registry — byte-for-byte the live
 *  `/workspaces` row shape (dashboard-workspace-registry ADR / mock-mirrors-
 *  live-wire-shape): stable id, label, monospace path identity, the launch-
 *  default marker, and a reachability state with a reason when degraded. */
interface MockWorkspaceRoot {
  id: string;
  label: string;
  path: string;
  is_launch: boolean;
  reachable: boolean;
  unreachable_reason: string | null;
}

/** The workspace id the mock auto-registers as the launch root — the same id the
 *  live engine derives from the launch workspace's git common dir. */
export const MOCK_WORKSPACE_ID = "/repo/.git";

// --- delta timeline (pure, derived from the corpus event log) -------------------

export interface TimelineDelta extends GraphDeltaEntry {
  /** ms timestamp, mirrors `t`. */
  ts: number;
}

/**
 * Derive the ordered delta log from the corpus: each doc-created event adds
 * its node and edges; commits add the commit node and its temporal edge;
 * step-checked events change the plan node. seq is 1-based in ts order —
 * the single delta clock everything splices on.
 */
export function buildDeltaTimeline(corpus: FixtureCorpus): TimelineDelta[] {
  const nodeById = new Map(corpus.nodes.map((n) => [n.id, n]));
  const deltas: TimelineDelta[] = [];
  // Feature nodes (the default stage species) enter the timeline at their
  // creation date — historical slices must carry them (audit finding
  // mock-asof-omits-feature-nodes-009).
  const featureCreated = new Map<string, number>();
  for (const node of corpus.nodes) {
    if (node.kind !== "feature") continue;
    const ts = Date.parse(node.dates?.created ?? corpus.events[0]?.ts ?? "");
    if (!Number.isFinite(ts)) continue;
    featureCreated.set(node.id, ts);
    deltas.push({ op: "add", node, t: ts, ts, seq: 0 });
  }
  // Constellation meta-edges appear once both endpoint features exist.
  for (const meta of corpus.metaEdges) {
    const ts = Math.max(
      featureCreated.get(meta.src) ?? 0,
      featureCreated.get(meta.dst) ?? 0,
    );
    if (ts > 0) deltas.push({ op: "add", edge: meta, t: ts, ts, seq: 0 });
  }
  const emittedEdges = new Set<string>();
  for (const event of corpus.events) {
    const ts = Date.parse(event.ts);
    const primary = event.node_ids[0];
    const node = nodeById.get(primary);
    if (!node) continue;
    if (event.kind === "doc-created" || event.kind === "commit") {
      deltas.push({ op: "add", node, t: ts, ts, seq: 0 });
      for (const edge of corpus.edges) {
        if (edge.src === primary && Date.parse(edge.observed_at ?? event.ts) <= ts) {
          deltas.push({ op: "add", edge, t: ts, ts, seq: 0 });
          emittedEdges.add(edge.id);
        }
      }
    } else if (event.kind === "step-checked") {
      deltas.push({ op: "change", node, t: ts, ts, seq: 0 });
    }
  }
  // Edges observed after their source's creation event (e.g. semantic
  // discoveries) enter the timeline at their own observed_at — every
  // corpus edge exists somewhere on the clock.
  for (const edge of corpus.edges) {
    if (emittedEdges.has(edge.id) || !edge.observed_at) continue;
    const ts = Date.parse(edge.observed_at);
    if (Number.isFinite(ts)) deltas.push({ op: "add", edge, t: ts, ts, seq: 0 });
  }
  deltas.sort((a, b) => a.ts - b.ts);
  deltas.forEach((d, i) => {
    d.seq = i + 1;
    d.t = d.ts;
  });
  return deltas;
}

/**
 * Project the mock's internal meta-edge (an `EngineEdge` carrying the
 * aggregation on `.meta`, the shape the delta timeline replays) onto the
 * live serve wire (engine addendum S02): the SEPARATE `meta_edges` array
 * element, with the bare feature ids decomposed back to `src_feature` /
 * `dst_feature`. The client's adaptGraphSlice folds this back into edges —
 * exercising the exact path the live origin takes.
 */
function toWireMetaEdge(edge: EngineEdge): WireMetaEdge {
  return {
    src: edge.src,
    dst: edge.dst,
    src_feature: edge.src.replace(/^feature:/, ""),
    dst_feature: edge.dst.replace(/^feature:/, ""),
    count: edge.meta?.count ?? 0,
    breakdown_by_tier: edge.meta?.breakdown_by_tier ?? {},
  };
}

// --- temporal-lineage projection (dashboard-timeline ADR) ------------------------
//
// The mock serves the EXACT live `/graph/lineage` wire shape (mock-mirrors-live-
// wire-shape): the dated document nodes in range with their derived phase lane,
// the self-consistent arcs among them drawn from the corpus's REAL relation/tier
// edges (derivation-FALLBACK: NO `derivation` field, exactly as the engine emits
// until the node-semantics field ships — engine `lineage.rs` `lineage_arc` sets
// `derivation: None`), bounded with an honest `truncated` block (null here), and
// the per-tier envelope `tiers` block with semantic present-only. A divergence
// from the live shape is a test-fidelity defect to fix HERE, never papered over.

/** The single deterministic doc-type → pipeline-lane mapping (engine
 *  `phase_for_doc_type`, kebab-case lane token): research/reference → research;
 *  adr → adr; plan → plan; exec → exec; audit → review; rule → codify. Returns
 *  null for a doc-type with no lane (commit is ambient; index/unknown own none),
 *  so the projection never invents a phase for an artifact the pipeline does not
 *  own — byte-for-byte the engine's mapping. */
function lineagePhaseForDocType(docType: string | undefined): string | null {
  switch (docType) {
    case "research":
    case "reference":
      return "research";
    case "adr":
      return "adr";
    case "plan":
      return "plan";
    case "exec":
      return "exec";
    case "audit":
      return "review";
    case "rule":
      return "codify";
    default:
      // commit (ambient), index, and any unknown doc-type own no lane.
      return null;
  }
}

/**
 * The two launch salience lenses (graph-node-salience ADR), the exact wire
 * tokens the mock honors on `/graph/query`. STATUS is the default (omitted lens).
 */
type MockLens = "status" | "design";

function parseMockLens(raw: unknown): MockLens {
  return raw === "design" ? "design" : "status";
}

/**
 * A deterministic mock salience that mirrors the LIVE wire SHAPE exactly
 * (mock-mirrors-live-wire-shape): a single active-lens `salience` float in [0,1]
 * on each DOCUMENT node, lens-dependent so the two lenses order the same node set
 * differently — the design lens favors authority documents (adr/research),
 * the status lens favors roadmap documents (plan) and recent exec activity. This
 * is NOT the real DOI engine (that is CPU-side); it is a faithful stand-in for the
 * field's SHAPE and lens-dependence so the client path that reads/orders by
 * salience is exercised against the same wire contract the live engine serves.
 */
function mockSalienceFor(node: EngineNode, lens: MockLens): number {
  const docType = node.doc_type ?? "document";
  const authorityWeight: Record<string, number> = {
    adr: 1.0,
    research: 0.8,
    reference: 0.7,
    plan: 0.4,
    audit: 0.5,
    rule: 0.5,
    exec: 0.1,
    index: 0.0,
  };
  const roadmapWeight: Record<string, number> = {
    plan: 1.0,
    audit: 0.6,
    adr: 0.5,
    exec: 0.3,
    research: 0.3,
    reference: 0.3,
    rule: 0.4,
    index: 0.0,
  };
  const base =
    lens === "design"
      ? (authorityWeight[docType] ?? 0.2)
      : (roadmapWeight[docType] ?? 0.2);
  // A small connectivity nudge so nodes of the same type still differ, clamped
  // to [0,1]. Deterministic from the served degree projection.
  const degree =
    (node.degree_by_tier?.declared ?? 0) + (node.degree_by_tier?.structural ?? 0);
  return Math.min(1, Math.max(0, base * 0.9 + Math.min(0.1, degree * 0.02)));
}

// --- the mock engine --------------------------------------------------------------

type StreamSubscriber = (channel: string, data: unknown) => void;

export class MockEngine {
  readonly corpus: FixtureCorpus;
  readonly timeline: TimelineDelta[];
  private degradations = new Map<string, string>();
  private subscribers = new Set<StreamSubscriber>();
  // Debug-switch conditions that degrade SERVED data (finding 035): the
  // corpus disappears (no vault) or the lifecycle lane runs dry (core
  // date-mandate not landed).
  private noVault = false;
  private lifecycleSparse = false;
  // The bounded-query node ceiling fired (graph-queries-are-bounded-by-default):
  // when set, `/graph/query` echoes the live engine's `truncated` block
  // (`total_nodes`/`returned_nodes`/`reason`) alongside the capped slice, the
  // exact shape `vaultspec-api` `query.rs` serves. The mock must be able to emit
  // the live shape so the canvas's "narrowed — refine your view" chrome state is
  // exercised through the real client path (mock-mirrors-live-wire-shape).
  private truncatedTotal: number | null = null;
  // The plan-container interior node ceiling fired (dashboard-pipeline-status,
  // graph-queries-are-bounded-by-default): when set, `/nodes/{id}/plan-interior`
  // echoes the live engine's `truncated` block alongside the capped tree, the
  // exact shape the live route serves, so the Work surface's "narrowed — refine"
  // step-tree state is exercised through the real client path.
  private planInteriorTruncatedTotal: number | null = null;
  // The file-tree per-level child ceiling fired (dashboard-code-tree,
  // graph-queries-are-bounded-by-default): when set, `/file-tree` caps the level
  // to this many children and echoes the live engine's `truncated` block, the
  // exact shape `vaultspec-api` `file_tree.rs` serves, so the code mode's "more
  // here — expand a subdirectory" state is exercised through the real client path.
  private fileTreeLevelCap: number | null = null;
  // Git working-tree state served on /status (git-diff-browser surface). The mock
  // mirrors the LIVE wire shape exactly (mock-mirrors-live-wire-shape): `dirty` is
  // a BOOLEAN ("is the tree dirty?") — the live engine serves NO per-file list —
  // and `ahead`/`behind` are Option<u32>, ABSENT (undefined) by default to model
  // "no upstream configured". There is NO read-only diff endpoint: the live ops
  // whitelist is `/ops/core/*` and `/ops/rag/*` only, so no `/ops/git/*` route is
  // served and the diff capability is engine-blocked in the chrome.
  private gitDirty = false;
  private gitAhead: number | undefined = undefined;
  private gitBehind: number | undefined = undefined;

  // --- session / settings state (mirrors the live store) ---
  /** The active worktree scope — the "where am I" pointer restored on load. The
   *  active scope drives `/status` and the stream's scope fallback. */
  private activeScope = MOCK_SCOPE;
  /** Per-scope folder + feature-tag context. A scope absent here defaults to
   *  the empty context (folder null, no tags) — exactly like the live store. */
  private scopeContexts = new Map<string, MockScopeContext>();
  /** Workspace recents, most-recent-first (push dedups + moves to front). */
  private recents: string[] = [];
  /** Global settings: a flat `{ key: value }` map. */
  private globalSettings = new Map<string, string>();
  /** Per-scope scoped settings: `scope → { key: value }`. A scope with no scoped
   *  keys is sparse-omitted from the served `scoped` map (live parity). */
  private scopedSettings = new Map<string, Map<string, string>>();

  // --- workspace registry state (mirrors the live store) ---
  /** The registered project roots, in stable registry order. Seeded with the
   *  auto-registered launch root so the single-project experience matches boot. */
  private workspaceRoots: MockWorkspaceRoot[] = [
    {
      id: MOCK_WORKSPACE_ID,
      label: "repo",
      path: MOCK_WORKSPACE,
      is_launch: true,
      reachable: true,
      unreachable_reason: null,
    },
  ];
  /** The active workspace id — the registered root the dashboard is pointed at. */
  private activeWorkspace: string | null = MOCK_WORKSPACE_ID;

  /** No vault in the worktree: the served corpus is empty (035). */
  setNoVault(on: boolean): void {
    this.noVault = on;
  }

  /** Date-mandate missing: lifecycle-lane events drop from serving (035). */
  setLifecycleSparse(on: boolean): void {
    this.lifecycleSparse = on;
  }

  /**
   * Simulate the engine's hard node ceiling firing on `/graph/query`: pass the
   * pre-cap total so the served slice carries the live `truncated` block (the
   * capped subgraph stays self-consistent; only the honesty block is added).
   * Pass null to clear. Mirrors the live `vaultspec-api` `query.rs` shape so the
   * canvas's truncated state is exercised through the real client path.
   */
  setTruncated(total: number | null): void {
    this.truncatedTotal = total;
  }

  /**
   * Simulate the plan-interior node ceiling firing on `/nodes/{id}/plan-interior`:
   * pass a pre-cap total (or `true` for a representative one) so the served
   * interior carries the live `truncated` block alongside the capped tree. Pass
   * null/false to clear. Mirrors the live route shape so the Work surface's honest
   * step-tree truncation is exercised through the real client path.
   */
  setPlanInteriorTruncated(total: number | boolean | null): void {
    this.planInteriorTruncatedTotal =
      total === true ? 9001 : total === false || total === null ? null : total;
  }

  /**
   * Simulate the file-tree per-level child ceiling firing on `/file-tree`: pass
   * the cap so a directory level with more children truncates to it and carries
   * the live `truncated` block alongside the capped (still-sorted) level. Pass
   * null to clear. Mirrors the live `vaultspec-api` `file_tree.rs` shape so the
   * code mode's honest level truncation is exercised through the real client path.
   */
  setFileTreeLevelCap(cap: number | null): void {
    this.fileTreeLevelCap = cap;
  }

  /** Set the working-tree dirty BOOLEAN served on /status (live shape). */
  setGitDirty(dirty: boolean): void {
    this.gitDirty = dirty;
  }

  /** Set the upstream divergence served on /status. Both Option<u32>: pass
   *  undefined to model "no upstream configured" (absent ≠ zero). */
  setGitDivergence(ahead: number | undefined, behind: number | undefined): void {
    this.gitAhead = ahead;
    this.gitBehind = behind;
  }

  /** The currently-active scope — test/demo introspection. */
  get scope(): string {
    return this.activeScope;
  }

  /** Build the `/session` data block (GET and PUT return the same shape). */
  private sessionData(): unknown {
    const ctx = this.scopeContexts.get(this.activeScope) ?? {
      folder: null,
      feature_tags: [],
    };
    return {
      workspace: MOCK_WORKSPACE,
      active_scope: this.activeScope,
      // The active WORKSPACE id beside the active scope (dashboard-workspace-
      // registry ADR): the registered root the dashboard is pointed at. Mirrors
      // the live `/session` field.
      active_workspace: this.activeWorkspace,
      scope_context: { folder: ctx.folder, feature_tags: [...ctx.feature_tags] },
      recents: [...this.recents],
      tiers: this.tiersBlock(),
    };
  }

  /** Build the `/workspaces` data block (mirrors the live route): the registered
   *  roots with reachability, plus the active-workspace id. Flat-with-tiers, the
   *  shape `unwrapEnvelope` + the workspaces adapter consume. */
  private workspacesData(): unknown {
    return {
      workspaces: this.workspaceRoots.map((r) => ({ ...r })),
      active_workspace: this.activeWorkspace,
      tiers: this.tiersBlock(),
    };
  }

  /** Mark a registered root unreachable (or recover it) — test/demo affordance
   *  for the degraded-root rail state. A no-op when the id is unknown. */
  setWorkspaceReachable(id: string, reachable: boolean, reason: string | null): void {
    const root = this.workspaceRoots.find((r) => r.id === id);
    if (!root) return;
    root.reachable = reachable;
    root.unreachable_reason = reachable ? null : reason;
  }

  /** The registered roots — test/demo introspection. */
  get workspaces(): readonly MockWorkspaceRoot[] {
    return this.workspaceRoots;
  }

  /** Build the `/settings` data block. `scoped` sparse-omits empty scopes. */
  private settingsData(): unknown {
    const global: Record<string, string> = {};
    for (const [key, value] of this.globalSettings) global[key] = value;
    const scoped: Record<string, Record<string, string>> = {};
    for (const [scope, entries] of this.scopedSettings) {
      if (entries.size === 0) continue;
      const map: Record<string, string> = {};
      for (const [key, value] of entries) map[key] = value;
      scoped[scope] = map;
    }
    return { global, scoped, tiers: this.tiersBlock() };
  }

  /**
   * Apply a partial PUT /session update (mirrors the live route): any absent
   * field leaves that part untouched. `active_scope` retargets the active scope
   * but is validated through the (mock) registry FIRST — an unknown or
   * non-vault-bearing scope is a tiered 400 and the active scope is left
   * unchanged (live parity, the conformance "unknown scope" assertion).
   * `scope_context` sets a scope's folder + feature_tags wholesale (an absent or
   * null folder clears it). `push_recent` pushes one value onto the recents.
   */
  private applySessionUpdate(init: RequestInit): unknown {
    const body = init.body
      ? (JSON.parse(String(init.body)) as {
          active_scope?: string;
          scope_context?: {
            scope?: string;
            folder?: string | null;
            feature_tags?: string[];
          };
          push_recent?: string;
          active_workspace?: string;
          add_workspace?: string;
          forget_workspace?: string;
        })
      : {};

    // Registry mutations route through the session config surface (the live
    // route's P02.S09 ordering): forget, then add, then select-active. All are
    // read-only over repository content — registering only RECORDS a path.
    if (body.forget_workspace !== undefined) {
      this.forgetWorkspace(body.forget_workspace);
    }
    if (body.add_workspace !== undefined) {
      this.addWorkspace(body.add_workspace);
    }
    if (body.active_workspace !== undefined) {
      if (!this.workspaceRoots.some((r) => r.id === body.active_workspace)) {
        // Tiered 400, active workspace unchanged (the live route's behavior).
        throw new RouteError(
          400,
          `workspace ${body.active_workspace} is not a registered project root`,
        );
      }
      this.activeWorkspace = body.active_workspace;
    }

    // Validate + retarget the active scope FIRST (the one step that can 400).
    if (body.active_scope !== undefined) {
      if (!VAULT_BEARING_SCOPES.has(body.active_scope)) {
        // Tiered 400, active scope unchanged (the live route's behavior).
        throw new RouteError(
          400,
          `unknown or non-vault-bearing scope ${body.active_scope}`,
        );
      }
      this.activeScope = body.active_scope;
    }

    if (body.scope_context !== undefined) {
      const ctx = body.scope_context;
      const target = ctx.scope && ctx.scope.length > 0 ? ctx.scope : this.activeScope;
      this.scopeContexts.set(target, {
        folder: typeof ctx.folder === "string" ? ctx.folder : null,
        feature_tags: Array.isArray(ctx.feature_tags) ? [...ctx.feature_tags] : [],
      });
    }

    if (body.push_recent !== undefined) {
      this.pushRecent(body.push_recent);
    }

    // Return the updated session — the same shape GET serves.
    return this.sessionData();
  }

  /** Push a value to the front of recents, dedup-moving an existing entry. */
  private pushRecent(value: string): void {
    this.recents = [value, ...this.recents.filter((r) => r !== value)];
  }

  /**
   * Register (upsert) a project root from an operator-supplied path (mirrors the
   * live read-only register): a path the mock recognizes as a valid project is
   * recorded as a new root; an unrecognized path is a tiered 400 (the live
   * "not a git workspace" refusal). The mock cannot probe a real filesystem, so
   * it treats any non-empty path NOT starting with `bad` as a valid project,
   * deriving a stable id from the path — enough to exercise the add → list →
   * forget flow and the validation-refusal state through the real client path.
   * Registering only RECORDS the path; it never mutates anything.
   */
  private addWorkspace(path: string): void {
    if (path.length === 0 || path.startsWith("bad")) {
      throw new RouteError(400, `cannot register ${path}: not a git workspace`);
    }
    const id = `${path}/.git`;
    if (this.workspaceRoots.some((r) => r.id === id)) return; // upsert no-op
    const label = path.replace(/\/+$/, "").split("/").pop() || path;
    this.workspaceRoots.push({
      id,
      label,
      path,
      is_launch: false,
      reachable: true,
      unreachable_reason: null,
    });
  }

  /**
   * Forget a registered root by id (mirrors the live config delete): the launch
   * workspace cannot be forgotten while it is the only root (a tiered 400);
   * forgetting any other root removes only its registry entry and never touches
   * disk. An unknown id is a harmless no-op.
   */
  private forgetWorkspace(id: string): void {
    const target = this.workspaceRoots.find((r) => r.id === id);
    if (!target) return;
    if (target.is_launch && this.workspaceRoots.length === 1) {
      throw new RouteError(
        400,
        "the launch workspace cannot be forgotten while it is the only registered root",
      );
    }
    this.workspaceRoots = this.workspaceRoots.filter((r) => r.id !== id);
  }

  /** Build the `/settings/schema` data block — the engine-owned registry, mirrored
   *  byte-for-byte from the live serialization (mock-mirrors-live-wire-shape). */
  private settingsSchemaData(): unknown {
    return {
      settings: MOCK_SETTINGS_REGISTRY,
      groups: MOCK_SETTINGS_GROUPS,
      tiers: this.tiersBlock(),
    };
  }

  /**
   * Apply a single PUT /settings write (mirrors the live route): a key/value
   * pair, global when `scope` is absent, scope-scoped otherwise. The write is
   * validated against the registry FIRST — an unknown key, an out-of-constraint
   * value, or a scope on a global-only setting is a typed tiered 400 carrying the
   * machine-readable error_kind (exact live parity). The canonical (normalized)
   * value is what persists. Returns the full updated settings, the GET shape.
   */
  private applySettingsUpdate(init: RequestInit): unknown {
    const body = init.body
      ? (JSON.parse(String(init.body)) as {
          scope?: string;
          key: string;
          value: string;
        })
      : { key: "", value: "" };
    const scoped = body.scope !== undefined && body.scope !== "";
    const canonical = mockValidateSetting(body.key, body.value, scoped);
    if (scoped) {
      const scope = body.scope as string;
      const entries = this.scopedSettings.get(scope) ?? new Map<string, string>();
      entries.set(body.key, canonical);
      this.scopedSettings.set(scope, entries);
    } else {
      this.globalSettings.set(body.key, canonical);
    }
    return this.settingsData();
  }

  constructor(corpus: FixtureCorpus = buildFixtureCorpus()) {
    this.corpus = corpus;
    this.timeline = buildDeltaTimeline(corpus);
  }

  /** Mark a tier degraded (the W03 degradation matrix debug switch input). */
  degrade(tier: string, reason: string | null): void {
    if (reason === null) this.degradations.delete(tier);
    else this.degradations.set(tier, reason);
  }

  tiersBlock(): TiersBlock {
    const block: TiersBlock = {};
    for (const tier of ["declared", "structural", "temporal", "semantic"]) {
      const reason = this.degradations.get(tier);
      block[tier] = reason ? { available: false, reason } : { available: true };
    }
    return block;
  }

  /** A tiers block with ONE named tier marked unavailable for THIS response only
   *  (no persistent `degrade()` mutation), mirroring the live engine's per-request
   *  `degraded_tiers_for` (dashboard-code-tree worktree-only degradation): the
   *  file-tree's structural degradation on a scope with no listable working tree
   *  rides this, so the code mode renders a designed degraded state. */
  private degradedTiersFor(tier: string, reason: string): TiersBlock {
    const block = this.tiersBlock();
    block[tier] = { available: false, reason };
    return block;
  }

  /** Push a live event onto a stream channel (tests and demos drive this). */
  push(channel: string, data: unknown): void {
    for (const subscriber of this.subscribers) {
      subscriber(channel, data);
    }
  }

  get lastSeq(): number {
    return this.timeline.length;
  }

  /** The corpus's edge of history — the LIVE boundary on the data's clock. */
  get maxEventTs(): number {
    return this.timeline.length > 0 ? this.timeline[this.timeline.length - 1].ts : 0;
  }

  /** Sequence position of the last delta at or before a ms timestamp. */
  seqAt(t: number): number {
    let seq = 0;
    for (const delta of this.timeline) {
      if (delta.ts > t) break;
      seq = delta.seq;
    }
    return seq;
  }

  /** Slice as of a ms timestamp (or now for live). */
  sliceAsOf(t: number): { nodes: EngineNode[]; edges: EngineEdge[]; seq: number } {
    const nodes = new Map<string, EngineNode>();
    const edges = new Map<string, EngineEdge>();
    let seq = 0;
    for (const delta of this.timeline) {
      if (delta.ts > t) break;
      seq = delta.seq;
      if (delta.node) {
        if (delta.op === "remove") nodes.delete(delta.node.id);
        else nodes.set(delta.node.id, delta.node);
      }
      if (delta.edge) {
        if (delta.op === "remove") edges.delete(delta.edge.id);
        else edges.set(delta.edge.id, delta.edge);
      }
    }
    // Historical views: declared + structural + temporal only (§5).
    // Classified against the CORPUS's clock, never the wall clock (audit
    // finding asof-wallclock-historical-012).
    const historical = t < this.maxEventTs;
    const edgeList = [...edges.values()]
      .filter((e) => !historical || e.tier !== "semantic")
      .filter((e) => this.tierServed(e));
    return { nodes: [...nodes.values()], edges: edgeList, seq };
  }

  /**
   * Degradation gates CONTENT, not just the block (audit finding
   * degraded-tier-still-served-011): a degraded tier's edges — and
   * meta-edges whose breakdown is exclusively that tier — drop out.
   */
  private tierServed(edge: EngineEdge): boolean {
    if (edge.meta) {
      return Object.keys(edge.meta.breakdown_by_tier).some(
        (tier) => !this.degradations.has(tier),
      );
    }
    return !this.degradations.has(edge.tier);
  }

  /** The fetch-shaped transport the EngineClient plugs into. */
  fetchImpl: FetchLike = (input, init) => {
    const url = new URL(input, "http://mock.local");
    const path = url.pathname.replace(/^\/api/, "");
    const params = url.searchParams;
    try {
      if (path === "/stream") return Promise.resolve(this.streamResponse(params));
      const body = this.route(path, params, init);
      return Promise.resolve(json(body));
    } catch (err) {
      if (err instanceof RouteError) {
        const body: Record<string, unknown> = {
          ok: false,
          error: err.message,
          tiers: this.tiersBlock(),
        };
        if (err.kind !== undefined) body.error_kind = err.kind;
        return Promise.resolve(json(body, err.status));
      }
      throw err;
    }
  };

  // --- routes ----------------------------------------------------------------

  private route(path: string, params: URLSearchParams, init?: RequestInit): unknown {
    const tiers = this.tiersBlock();
    const c = this.corpus;
    if (path === "/status") {
      // `/status` reports the ACTIVE scope's cell (W02.P04.S13): scope, index,
      // watcher, and last_seq all reflect the selected worktree. The mock serves
      // one corpus, so the counts are stable, but the `scope` field echoes the
      // active selection for live parity.
      return {
        ok: true,
        scope: this.activeScope,
        nodes: this.noVault ? 0 : c.nodes.length,
        edges: this.noVault ? 0 : c.edges.length,
        last_seq: this.lastSeq,
        degradations: [...this.degradations.keys()],
        tiers,
        // The mock serves the already-internal /status shape (it carries `nodes`
        // + `degradations`, so adaptStatus passes it through unchanged). The git
        // block therefore mirrors the INTERNAL EngineStatus.git: `branch` (the
        // adapter's head_ref→branch result), `dirty` BOOLEAN, and Option ahead/
        // behind OMITTED when undefined (no upstream). A separate parity test
        // feeds a RAW live-shaped `{head_ref, ...}` sample through adaptStatus.
        git: {
          branch: "main",
          dirty: this.gitDirty,
          ...(this.gitAhead !== undefined ? { ahead: this.gitAhead } : {}),
          ...(this.gitBehind !== undefined ? { behind: this.gitBehind } : {}),
        },
        core: { reachable: true, vault_health: "green" },
        rag: this.degradations.has("semantic")
          ? { service: "stopped" }
          : { service: "running", watcher: "watching", index: "fresh", jobs: 0 },
      };
    }
    if (path === "/session") {
      if (init?.method === "PUT") {
        return this.applySessionUpdate(init);
      }
      return this.sessionData();
    }
    if (path === "/settings/schema") {
      return this.settingsSchemaData();
    }
    if (path === "/settings") {
      if (init?.method === "PUT") {
        return this.applySettingsUpdate(init);
      }
      return this.settingsData();
    }
    if (path === "/workspaces") {
      // The registered project roots with reachability + the active-workspace id
      // (dashboard-workspace-registry ADR). Registry MUTATION rides /session
      // (config), not here — /workspaces is read-only enumeration, like the live
      // route.
      return this.workspacesData();
    }
    if (path === "/map") {
      // The optional `workspace=` selector (dashboard-workspace-registry ADR,
      // P02.S07): absent or `active` is the unchanged single-workspace default;
      // an unknown registered id 400s honestly, exactly like the live route. The
      // mock serves one corpus, so a known workspace returns the same map.
      const workspace = params.get("workspace");
      if (
        workspace &&
        workspace !== "active" &&
        !this.workspaceRoots.some((r) => r.id === workspace)
      ) {
        throw new RouteError(
          400,
          `workspace ${workspace} is not a registered project root`,
        );
      }
      return {
        repositories: [
          {
            path: "/repo",
            branches: [
              { name: "main", kind: "default" },
              { name: "feature/timeline", kind: "feature" },
            ],
            worktrees: [
              {
                id: MOCK_SCOPE,
                path: "/repo",
                branch: "main",
                has_vault: true,
                is_default: true,
              },
              {
                id: "wt-bare",
                path: "/repo-bare",
                branch: "feature/timeline",
                has_vault: false,
                degraded: ["structural"],
              },
            ],
          },
        ],
        tiers,
      };
    }
    if (path === "/vault-tree") {
      requireScope(params);
      return { entries: this.noVault ? [] : c.vaultTree, tiers };
    }
    if (path === "/file-tree") {
      // One bounded, ignore-aware directory level of the worktree file tree
      // (dashboard-code-tree ADR), mirroring the live `vaultspec-api`
      // `/file-tree` wire shape: per-child path + kind + has_children + the
      // shared `code:<path>` interlink node id, a `truncated` honesty marker
      // when the level is capped, and a top-level `next_cursor` when it
      // paginates. A scope with no readable working tree (`setNoVault`) degrades
      // the `structural` tier honestly with an empty level, never a bare error.
      requireScope(params);
      return this.fileTreeData(params);
    }
    if (path === "/pipeline") {
      // In-flight pipeline projection (dashboard-pipeline-wire W02): active plans
      // + in-flight ADRs in the resolved scope, byte-for-byte the live shape.
      requireScope(params);
      return this.pipelineData();
    }
    if (path === "/graph/query") {
      // Match the live serve wire (contract §4, engine addendum S02): the
      // request's granularity selects document edges OR feature-convergence
      // nodes plus a SEPARATE meta_edges array (edges empty) — never folded
      // into edges. Document is the default, mirroring the engine. Degraded
      // tiers gate content here too (011); an absent corpus serves
      // nothing (035).
      const reqBody = init?.body
        ? (JSON.parse(String(init.body)) as {
            granularity?: string;
            filter?: unknown;
            lens?: string;
            focus?: string | null;
          })
        : {};
      const filter = reqBody.filter;
      // The active salience lens (graph-node-salience ADR wire amendment): the
      // mock honors the `lens` request parameter and defaults to STATUS when
      // omitted, byte-for-byte the live engine (Lens::parse). The lens is echoed.
      const lens = parseMockLens(reqBody.lens);
      // salience_partial read from the SAME tiers block the response carries
      // (degradation-is-read-from-tiers), mirroring the live `is_partial`: a
      // degraded backbone tier (declared/structural) flags any lens partial; a
      // degraded temporal tier flags the STATUS lens partial.
      const degraded = (t: string) => tiers[t]?.available === false;
      const saliencePartial =
        degraded("declared") ||
        degraded("structural") ||
        (lens === "status" && degraded("temporal"));
      // The bounded-query honesty block, mirroring the live `vaultspec-api`
      // `query.rs`: `null` on an unbounded slice, the object when the ceiling
      // fired. The reason text matches the live "narrow with a filter" copy.
      const truncated =
        this.truncatedTotal !== null
          ? {
              total_nodes: this.truncatedTotal,
              returned_nodes: this.truncatedTotal,
              reason:
                "graph node ceiling: narrow with a filter; the feature " +
                "constellation is the smallest view",
            }
          : null;
      if (this.noVault) {
        return {
          nodes: [],
          edges: [],
          meta_edges: [],
          filter,
          tiers,
          last_seq: null,
          truncated: null,
          lens,
          salience_partial: saliencePartial,
        };
      }
      // LIVE /graph/query carries `last_seq` — the delta clock's tip at query
      // time — so a held keyframe splices live `graph` deltas with no gap
      // (contract §4; the live engine emits it, so the mock must mirror it).
      if (reqBody.granularity === "feature") {
        // Feature-convergence nodes are NOT salience-ranked (the model ranks
        // documents), so they carry no salience field — live parity.
        return {
          nodes: c.nodes.filter((n) => n.kind === "feature"),
          edges: [],
          meta_edges: c.metaEdges.filter((e) => this.tierServed(e)).map(toWireMetaEdge),
          filter,
          tiers,
          last_seq: this.lastSeq,
          truncated,
          lens,
          salience_partial: saliencePartial,
        };
      }
      // Document granularity: attach the single active-lens salience float to each
      // document node and order by descending salience, so a truncation keeps the
      // top-DOI nodes for the active lens — byte-for-byte the live wire SHAPE.
      const docNodes = c.nodes
        .filter((n) => n.kind !== "feature")
        .map((n) => ({ ...n, salience: mockSalienceFor(n, lens) }))
        .sort(
          (a, b) => (b.salience ?? 0) - (a.salience ?? 0) || a.id.localeCompare(b.id),
        );
      return {
        // Document nodes carry the single active-lens salience float, ordered
        // by descending salience (graph-node-salience), AND the additive
        // ontology (authority_class/aggregate) + embedding projections ride on
        // each node from the corpus fixture (spread through docNodes).
        nodes: docNodes,
        // The live engine's edge_view adds the additive `derivation` key to
        // EVERY edge (null when no pipeline relationship). Mirror that at the
        // serving boundary so the mock matches the live wire byte-for-byte
        // (graph-node-semantics ADR; mock-mirrors-live-wire-shape).
        edges: c.edges
          .filter((e) => this.tierServed(e))
          .map((e) => ({ derivation: e.derivation ?? null, ...e })),
        meta_edges: [],
        filter,
        tiers,
        last_seq: this.lastSeq,
        truncated,
        lens,
        salience_partial: saliencePartial,
      };
    }
    if (path === "/filters") {
      requireScope(params);
      // Mirror the live `/filters` wire shape (mock-mirrors-live): the facets
      // nest under `vocabulary` and `date_bounds` carries the live `{min, max}`
      // field names (inclusive ISO corpus span), so the mock flows through the
      // SAME `adaptFilters` mapping the live origin does rather than a convenient
      // already-internal shortcut.
      return {
        vocabulary: {
          relations: [...new Set(c.edges.map((e) => e.relation))].sort(),
          tiers: ["declared", "structural", "temporal", "semantic"],
          doc_types: ["research", "adr", "plan", "exec", "audit"],
          feature_tags: c.features,
          kinds: [...new Set(c.nodes.map((n) => n.kind))].sort(),
          date_bounds: {
            min: c.events[0]?.ts,
            max: c.events[c.events.length - 1]?.ts,
          },
        },
        tiers,
      };
    }
    const nodeMatch =
      /^\/nodes\/([^/]+)(\/(neighbors|evidence|discover|plan-interior))?$/.exec(path);
    if (nodeMatch) {
      const id = decodeURIComponent(nodeMatch[1]);
      const sub = nodeMatch[3];
      // plan-interior (dashboard-pipeline-wire W03): a truthful 404 for an
      // unknown node OR a non-plan node, mirroring the live route's None path.
      if (sub === "plan-interior") {
        const data = this.planInteriorData(id);
        if (!data) throw new RouteError(404, `no plan interior for node ${id}`);
        return data;
      }
      const node = c.nodes.find((n) => n.id === id);
      if (!node) throw new RouteError(404, `unknown node ${id}`);
      if (!sub) {
        return { node, interior: this.interiorOf(id), tiers };
      }
      if (sub === "neighbors") {
        const incident = c.edges.filter(
          (e) => (e.src === id || e.dst === id) && this.tierServed(e),
        );
        const ids = new Set([id, ...incident.flatMap((e) => [e.src, e.dst])]);
        return {
          nodes: c.nodes.filter((n) => ids.has(n.id)),
          edges: incident,
          tiers,
        };
      }
      if (sub === "evidence") {
        return {
          documents: c.vaultTree
            .filter((e) => node.feature_tags?.some((t) => e.feature_tags.includes(t)))
            .map((e) => ({ path: e.path, doc_type: e.doc_type })),
          code_locations: [
            {
              path: `src/${node.feature_tags?.[0] ?? "core"}/mod.rs`,
              state: "resolved",
            },
          ],
          commits: [
            {
              sha: "abc1234",
              subject: `feat: ${node.title ?? id}`,
              // The correlating rule is the attribution that makes a
              // correlated commit honest (finding 028).
              rule: "step-id-correlation",
            },
          ],
          tiers,
        };
      }
      if (sub === "discover") {
        if (this.degradations.has("semantic")) {
          throw new RouteError(502, "rag service down");
        }
        return {
          candidates: c.edges.filter((e) => e.tier === "semantic" && e.src === id),
          tiers,
        };
      }
    }
    if (path === "/events") {
      requireScope(params);
      const from = params.get("from") ? Date.parse(params.get("from")!) : -Infinity;
      const to = params.get("to") ? Date.parse(params.get("to")!) : Infinity;
      const source = this.noVault
        ? c.events.filter((e) => e.kind === "commit") // git still live (§8)
        : this.lifecycleSparse
          ? c.events.filter((e) => e.kind === "commit" || e.kind.startsWith("doc-"))
          : c.events;
      const within = source.filter((e) => {
        const ts = Date.parse(e.ts);
        return ts >= from && ts <= to;
      });
      const bucket = params.get("bucket");
      if (bucket && bucket !== "raw") {
        return { buckets: bucketEvents(within, bucket), tiers };
      }
      return { events: within, tiers };
    }
    if (path === "/graph/lineage") {
      // The bounded temporal-lineage projection (dashboard-timeline ADR),
      // mirroring the live `/graph/lineage` wire shape EXACTLY: dated document
      // nodes in the `[from, to]` ISO range with their derived phase lane, the
      // self-consistent arcs among them (derivation-fallback), bounded with an
      // honest `truncated` block. An absent corpus serves nothing (035).
      requireScope(params);
      return this.lineageData(params);
    }
    if (path === "/graph/asof") {
      requireScope(params);
      const t = Number(params.get("t"));
      const slice = this.sliceAsOf(t);
      // Mirror live wire shape: `last_seq` (not `seq`) per the asof contract.
      // The live engine returns last_seq: null while the S50 asof-seq gap is
      // open; the mock returns the real value so the diff splice test can
      // verify the clock seam without special-casing the null path.
      return { nodes: slice.nodes, edges: slice.edges, t, last_seq: slice.seq, tiers };
    }
    if (path === "/graph/diff") {
      requireScope(params);
      // The window is keyed on SEQ, mirroring the stream's since= splice:
      // ts boundaries resolve to sequence positions first, so ts-collision
      // siblings can never be dropped at the boundary (audit finding
      // diff-splice-lossy-ts-010).
      const fromSeq = this.seqAt(Number(params.get("from")));
      const toSeq = this.seqAt(Number(params.get("to")));
      const deltas = this.timeline
        .filter((d) => d.seq > fromSeq && d.seq <= toSeq)
        .map(({ op, node, edge, t, seq }) => ({ op, node, edge, t, seq }));
      return { deltas, last_seq: this.lastSeq, tiers };
    }
    if (path === "/search") {
      if (this.degradations.has("semantic")) {
        // Rag-down: a 502 whose error envelope still carries
        // `tiers.semantic.available:false` (contract §2 / search ADR). The
        // catch in `fetchImpl` attaches `this.tiersBlock()` to the error body,
        // and `semantic` is degraded here, so the gate reads it truthfully.
        throw new RouteError(502, "rag service down");
      }
      // Mirror the LIVE `/search` wire shape EXACTLY (mock-mirrors-live-wire-
      // shape / search ADR "Mock fidelity"): the engine forwards rag's nested
      // envelope verbatim — `{envelope: {ok, data: {results}}}` — and annotates
      // each result with its graph node id (contract §8, the sole value-add).
      // `adaptSearch` unwraps that nesting; serving the internal flat shape here
      // would let the adapter go untested against reality. The rag item carries
      // the rag vocabulary (`source`/`score`/`excerpt`) plus the engine's
      // `node_id` annotation.
      return {
        envelope: {
          ok: true,
          data: {
            results: c.nodes
              .filter((n) => n.kind !== "feature")
              .slice(0, 8)
              .map((n, i) => ({
                score: 0.9 - i * 0.07,
                source: n.title ?? n.id,
                excerpt: `…${n.title ?? n.id}…`,
                node_id: n.id,
              })),
          },
        },
        tiers,
      };
    }
    // Read-only `/ops/git/{verb}` pass-through (dashboard-pipeline-wire W04): the
    // live engine now serves porcelain status, numstat, and unified diff for a
    // path, forwarding git output verbatim inside the envelope. Mirror it.
    const gitOp = /^\/ops\/git\/([^/]+)$/.exec(path);
    if (gitOp) {
      return this.gitOp(decodeURIComponent(gitOp[1]), init);
    }
    const ops = /^\/ops\/(core|rag)\/([^/]+)$/.exec(path);
    if (ops) {
      if (ops[1] === "rag" && this.degradations.has("semantic")) {
        throw new RouteError(502, "rag service down");
      }
      return { ok: true, envelope: { status: "success", verb: ops[2] }, tiers };
    }
    throw new RouteError(404, `no mock route for ${path}`);
  }

  private interiorOf(id: string) {
    const interior = this.corpus.planInteriors.get(id);
    if (!interior) return undefined;
    return { nodes: interior.nodes, edges: interior.edges, tiers: this.tiersBlock() };
  }

  /**
   * Build one `/file-tree` directory level (dashboard-code-tree ADR), mirroring
   * the live `vaultspec-api` `file_tree.rs` wire shape: the immediate children of
   * `path` (empty for the worktree root) derived from the corpus's already-ignore-
   * filtered flat path set, each carrying the shared `code:<path>` node id (the
   * SAME kind+key rule `engine_model::node_id` uses — `code:` prefix + the repo-
   * relative path), the `dir`/`file` kind, and a `has_children` hint. Directories
   * sort before files (each group by path); the level is hard-capped (the bounded-
   * read invariant) with the live `truncated` block, then cursor-paginated with a
   * top-level `next_cursor`. A worktree with no listable source (`setNoVault`)
   * degrades the `structural` tier honestly with an empty level — never an error.
   */
  private fileTreeData(params: URLSearchParams): unknown {
    const rel = (params.get("path") ?? "").replace(/^\/+|\/+$/g, "");
    // No working tree to list: degrade the structural tier honestly (the code
    // mode renders a designed degraded state, not a healthy-looking empty).
    if (this.noVault) {
      return {
        entries: [],
        path: rel,
        truncated: null,
        tiers: this.degradedTiersFor("structural", "worktree not listable"),
      };
    }
    // Derive the immediate children of `rel` from the flat path set: the next
    // segment after the `rel/` prefix, deduped into dirs (more segments follow)
    // and files (the segment is the leaf).
    const prefix = rel.length > 0 ? `${rel}/` : "";
    const dirs = new Set<string>();
    const files = new Set<string>();
    for (const full of this.corpus.codeTree) {
      if (prefix.length > 0 && !full.startsWith(prefix)) continue;
      const remainder = full.slice(prefix.length);
      if (remainder.length === 0) continue;
      const slash = remainder.indexOf("/");
      if (slash === -1) {
        files.add(`${prefix}${remainder}`);
      } else {
        dirs.add(`${prefix}${remainder.slice(0, slash)}`);
      }
    }
    // Directories first, then files; each group sorted by path (the live order).
    const sorted: { path: string; is_dir: boolean }[] = [
      ...[...dirs].sort().map((p) => ({ path: p, is_dir: true })),
      ...[...files].sort().map((p) => ({ path: p, is_dir: false })),
    ];
    const total = sorted.length;
    // Hard-cap the level (the bounded-read invariant), then state it honestly.
    const cap = this.fileTreeLevelCap;
    const capped = cap !== null ? sorted.slice(0, cap) : sorted;
    const truncated =
      cap !== null && total > cap
        ? {
            total_children: total,
            returned_children: cap,
            reason:
              "directory level child ceiling: expand a subdirectory to narrow; " +
              "the level is capped to keep the wire bounded",
          }
        : null;
    // Cursor pagination over the capped, already-sorted level (cursor exclusive).
    const pageSizeRaw = Number(params.get("page_size"));
    const pageSize =
      Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? pageSizeRaw : 500;
    const cursor = params.get("cursor");
    const start = cursor !== null ? capped.findIndex((c) => c.path > cursor) : 0;
    const from = start === -1 ? capped.length : start;
    const page = capped.slice(from, from + pageSize);
    const nextCursor =
      from + page.length < capped.length ? page[page.length - 1]?.path : undefined;
    const entries = page.map((child) => ({
      path: child.path,
      kind: child.is_dir ? "dir" : "file",
      // has_children: a directory has children iff some corpus path nests below
      // it; a file never does.
      has_children: child.is_dir
        ? this.corpus.codeTree.some((p) => p.startsWith(`${child.path}/`))
        : false,
      // The interlink: the stable `code:<path>` node id, the SAME kind+key rule
      // the engine derives (no private convention) — present for navigation even
      // when no `code:` graph node exists for the path (the absent-interlink
      // state the code mode renders quietly).
      node_id: `code:${child.path}`,
    }));
    return {
      entries,
      path: rel,
      truncated,
      ...(nextCursor !== undefined ? { next_cursor: nextCursor } : {}),
      tiers: this.tiersBlock(),
    };
  }

  /**
   * Build the `/pipeline` data block (dashboard-pipeline-wire W02): the in-flight
   * artifacts — active plans (by lifecycle) and in-flight ADRs (by status) — in
   * the active scope, each with progress, status/tier, pipeline phase, and stable
   * node id, sorted by node id. Mirrors the live `engine-query::pipeline::in_flight`
   * projection byte-for-byte: a complete plan and a rejected/deprecated ADR are
   * excluded; an active plan with work checked is in `execute`, otherwise `plan`.
   */
  private pipelineData(): unknown {
    const artifacts: {
      node_id: string;
      stem: string;
      title?: string;
      doc_type?: string;
      status?: string;
      tier?: string;
      progress?: { done: number; total: number };
      feature_tags?: string[];
      dates?: { created?: string; modified?: string };
      phase: string;
    }[] = [];
    if (!this.noVault) {
      for (const node of this.corpus.nodes) {
        if (!node.id.startsWith("doc:")) continue;
        const stem = node.id.replace(/^doc:/, "");
        if (node.doc_type === "plan") {
          const lc = node.lifecycle;
          if (!lc || lc.state !== "active") continue; // complete plans excluded
          const progress = lc.progress;
          artifacts.push({
            node_id: node.id,
            stem,
            title: node.title,
            doc_type: node.doc_type,
            tier: node.tier,
            progress,
            // Freshness + feature facets (dashboard-pipeline-status W01): the live
            // engine mirrors the doc node's dates and feature tags on the artifact.
            feature_tags: node.feature_tags,
            dates: node.dates,
            phase: progress && progress.done > 0 ? "execute" : "plan",
          });
        } else if (node.doc_type === "adr") {
          // In-flight ADR: proposed or accepted; rejected/deprecated excluded.
          if (node.status !== "proposed" && node.status !== "accepted") continue;
          artifacts.push({
            node_id: node.id,
            stem,
            title: node.title,
            doc_type: node.doc_type,
            status: node.status,
            feature_tags: node.feature_tags,
            dates: node.dates,
            phase: "adr",
          });
        }
      }
    }
    artifacts.sort((a, b) => a.node_id.localeCompare(b.node_id));
    return { artifacts, tiers: this.tiersBlock() };
  }

  /**
   * Build the `/graph/lineage` data block (dashboard-timeline ADR), mirroring the
   * live `engine-query::lineage::lineage` projection + the `graph_lineage` route
   * shape byte-for-byte: the dated, lane-owning document nodes whose blob-true
   * `created` falls within the `[from, to]` ISO range (inclusive, open on an
   * absent bound, lexical compare — the same well-ordering the engine uses), each
   * carrying its stable id, doc-type, derived phase lane, blob-true dates
   * (`created` string + `modified` epoch-ms NUMBER, the engine `Timestamp`), title,
   * and total degree; then the SELF-CONSISTENT arcs among ONLY the kept nodes
   * (every arc's src/dst is a returned node — no dangling arc), drawn from the
   * corpus's REAL relation/tier edges with NO `derivation` field (the graceful
   * fallback the engine emits until the node-semantics field ships). Bounded with
   * an honest `truncated` block (null under the corpus's small node count). The
   * envelope `tiers` block marks semantic present-only (excluded from the range
   * lineage), exactly as the live `degraded_tiers` overlay does.
   */
  private lineageData(params: URLSearchParams): unknown {
    const c = this.corpus;
    const tiers = this.lineageTiersBlock();
    if (this.noVault) {
      return { nodes: [], arcs: [], truncated: null, tiers };
    }
    const from = params.get("from");
    const to = params.get("to");
    // ISO `yyyy-mm-dd` strings compare lexically — the bounds are well-ordered
    // without date parsing (the same discipline the engine's `created_in_range`
    // uses). An undated node has no position on the timeline and is excluded.
    const inRange = (created: string | undefined): boolean => {
      if (!created) return false;
      // The corpus stores full ISO instants (`...T09:00:00Z`); the engine matches
      // on the `yyyy-mm-dd` prefix, so compare on the date prefix lexically.
      const day = created.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    };
    // Blob-true as-of (dashboard-timeline ADR fast-follow): when `t` is present the
    // slice reflects the graph as it existed at instant T — a node exists at T iff
    // it was created at/before T (the granularity the mock models, mirroring the
    // live `asof_graph_resolved` resolution). `t` is an epoch-ms token; absent = the
    // live graph. Arcs among the kept set are restricted transitively below.
    const asOfMs = params.get("t") != null ? Number(params.get("t")) : null;
    const existsAsOf = (created: string | undefined): boolean =>
      asOfMs == null || (!!created && Date.parse(created) <= asOfMs);
    // Degree: total edges (src or dst) touching a node, over all tiers — the v1
    // salience input, summed-endpoint count (mirrors the engine's degree_by_tier
    // sum). Built once over the corpus edges.
    const degreeOf = (id: string): number =>
      c.edges.reduce((n, e) => n + (e.src === id ? 1 : 0) + (e.dst === id ? 1 : 0), 0);
    // Collect the dated, lane-owning document nodes in range, id-sorted (the
    // engine sorts by stable id so the kept page is deterministic).
    const nodes = c.nodes
      .filter((n) => n.id.startsWith("doc:"))
      .map((n) => ({ n, phase: lineagePhaseForDocType(n.doc_type) }))
      .filter((x): x is { n: EngineNode; phase: string } => x.phase !== null)
      .filter((x) => inRange(x.n.dates?.created))
      .filter((x) => existsAsOf(x.n.dates?.created))
      .map(({ n, phase }) => ({
        id: n.id,
        doc_type: n.doc_type!,
        phase,
        // Blob-true dates: `created` (string) is the mark position; `modified` is
        // the engine `Timestamp` (epoch-ms NUMBER) — the corpus stores it as an
        // ISO string, so convert to ms to match the LIVE wire (a string here
        // would be a mock-vs-live divergence). Both omitted when absent.
        dates: {
          ...(n.dates?.created ? { created: n.dates.created } : {}),
          ...(n.dates?.modified ? { modified: Date.parse(n.dates.modified) } : {}),
        },
        ...(n.title ? { title: n.title } : {}),
        degree: degreeOf(n.id),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    // Self-consistency: only edges whose BOTH endpoints are in the kept node set
    // ship (no dangling arc), drawn from the corpus's real relation/tier edges.
    // derivation-FALLBACK: NO `derivation` field — exactly the engine's output
    // until the node-semantics field lands.
    const kept = new Set(nodes.map((n) => n.id));
    const arcs = c.edges
      .filter((e) => this.tierServed(e))
      .filter((e) => kept.has(e.src) && kept.has(e.dst))
      .map((e) => ({
        id: e.id,
        src: e.src,
        dst: e.dst,
        relation: e.relation,
        tier: e.tier,
        confidence: e.confidence,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return { nodes, arcs, truncated: null, tiers };
  }

  /**
   * The lineage envelope's `tiers` block (mirrors the live `degraded_tiers`
   * overlay): the cell's real declared/structural/temporal availability with
   * `semantic` marked unavailable for THIS response — present-only by design,
   * excluded from the range lineage (the engine's `LineageTiers::range_view`).
   * Layered over the persistent `degrade()` switches so a debug-degraded tier
   * still reports degraded.
   */
  private lineageTiersBlock(): TiersBlock {
    const block = this.tiersBlock();
    // semantic is present-only in the range lineage even when not debug-degraded.
    if (block.semantic?.available !== false) {
      block.semantic = {
        available: false,
        reason: "present-only by design; excluded from the range lineage",
      };
    }
    return block;
  }

  /**
   * Build the `/nodes/{id}/plan-interior` data block (dashboard-pipeline-wire
   * W03): the plan's wave/phase/step interior with per-step completion and the
   * bound exec record, mirroring the live `engine-query::node::plan_interior`
   * shape (tier-shape honest, optional `truncated`). The corpus interior is a flat
   * step list; the mock groups it into the live tier shape by the plan's `tier`
   * facet — L1 flat `steps`, L2 one `phases` block, L3/L4 one `waves` block — so
   * the consumer exercises every depth the live engine can serve.
   */
  private planInteriorData(id: string): unknown | null {
    const node = this.corpus.nodes.find((n) => n.id === id);
    if (!node || node.doc_type !== "plan") return null;
    const interior = this.corpus.planInteriors.get(id);
    const tiers = this.tiersBlock();
    const steps = (interior?.nodes ?? []).map((s) => ({
      node_id: s.id,
      // The corpus step id is `${planId}#S01`; the canonical leaf is `S01`.
      id: s.id.replace(/^.*#/, ""),
      action: s.title,
      done: s.lifecycle?.state === "complete",
    }));
    // The bounded-interior honesty block (graph-queries-are-bounded-by-default):
    // null unless the node ceiling was simulated, then the live `truncated` shape.
    const truncated =
      this.planInteriorTruncatedTotal !== null
        ? {
            total_nodes: this.planInteriorTruncatedTotal,
            returned_nodes: steps.length,
            reason: "plan interior node ceiling",
          }
        : null;
    // Mirror the LIVE wire shape exactly: the route wraps the interior under an
    // `interior` key inside the `{data, tiers}` envelope.
    let interiorShape: unknown;
    switch (node.tier) {
      case "L1":
        interiorShape = {
          plan_node_id: id,
          waves: [],
          phases: [],
          steps,
          truncated,
        };
        break;
      case "L2":
        interiorShape = {
          plan_node_id: id,
          waves: [],
          phases: [{ node_id: `${id}#P01`, id: "P01", heading: "phase", steps }],
          steps: [],
          truncated,
        };
        break;
      default:
        // L3 / L4 (and an untiered plan, defensively): one wave, one phase.
        interiorShape = {
          plan_node_id: id,
          waves: [
            {
              node_id: `${id}#W01`,
              id: "W01",
              heading: "wave",
              phases: [
                { node_id: `${id}#W01/P01`, id: "P01", heading: "phase", steps },
              ],
            },
          ],
          phases: [],
          steps: [],
          truncated,
        };
        break;
    }
    return { interior: interiorShape, tiers };
  }

  /**
   * Serve a read-only `/ops/git/{verb}` pass-through (dashboard-pipeline-wire
   * W04), mirroring the live wire shape: git's output forwarded VERBATIM inside
   * `{verb, output, tiers}`. The mock emits realistic porcelain status / numstat /
   * unified-diff text for the dirty fixture file so the consumer parses the same
   * verbatim format the live engine forwards. A non-whitelisted verb is a 403
   * (the live read-only whitelist), and the `diff` verb requires a `path`.
   */
  private gitOp(verb: string, init?: RequestInit): unknown {
    const whitelist = new Set(["status", "numstat", "diff"]);
    if (!whitelist.has(verb)) {
      throw new RouteError(
        403,
        `git verb ${verb} is not whitelisted (read-only ops/git)`,
      );
    }
    const path = init?.body
      ? (JSON.parse(String(init.body)) as { path?: string }).path
      : undefined;
    // The dirty fixture file the mock's git surface reports on.
    const file = ".vault/plan/2026-01-05-editor-demo-plan.md";
    let output = "";
    if (verb === "status") {
      // Porcelain v1: a branch header line, then per-file `XY path`.
      output = this.gitDirty ? `## main\n M ${file}\n` : "## main\n";
    } else if (verb === "numstat") {
      output = this.gitDirty ? `3\t1\t${file}\n` : "";
    } else if (verb === "diff") {
      if (path === undefined) {
        throw new RouteError(400, "git diff requires a path argument");
      }
      output = this.gitDirty
        ? `diff --git a/${path} b/${path}\n` +
          `index 1111111..2222222 100644\n` +
          `--- a/${path}\n+++ b/${path}\n` +
          `@@ -1,3 +1,3 @@\n` +
          ` context line\n-old line\n+new line\n`
        : "";
    }
    return { verb, output, tiers: this.tiersBlock() };
  }

  // --- SSE -----------------------------------------------------------------------

  private streamResponse(params: URLSearchParams): Response {
    const channels = new Set((params.get("channels") ?? "").split(","));
    const since = params.get("since");
    // The optional `scope` param (W02.P04.S14) targets a worktree's own clock.
    // The live engine NEVER errors the SSE handshake on a bad scope — it falls
    // back to the active scope. The mock serves one corpus on one timeline, so
    // it accepts `scope` and resumes that single clock; the parameter is honored
    // (read, not rejected) for live parity, and `since=` resumes the same clock.
    void params.get("scope");
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const send = (channel: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${channel}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };
        // Splice semantics (§7): resume from a known seq or signal the gap.
        // When `since` is provided this is a bounded replay request: emit
        // the missed deltas in order and close the stream (the replay window
        // is finite; no live-tail subscription is added). This lets a
        // refetch-after-reconnect pattern resolve cleanly in tests that model
        // the idempotent splice (§7) — the stream terminates once caught up.
        if (channels.has("graph") && since !== null) {
          const sinceSeq = Number(since);
          if (sinceSeq < this.lastSeq) {
            for (const d of this.timeline.filter((d) => d.seq > sinceSeq)) {
              send("graph", {
                op: d.op,
                node: d.node,
                edge: d.edge,
                t: d.t,
                seq: d.seq,
              });
            }
          }
          // Replay complete — close the stream so callers (e.g. refetchQueries)
          // can settle without waiting for an indefinitely-open connection.
          controller.close();
          return;
        }
        // No since= → live-tail mode: stay open for pushed events.
        const subscriber: StreamSubscriber = (channel, data) => {
          if (channels.has(channel)) send(channel, data);
        };
        this.subscribers.add(subscriber);
        unsubscribe = () => this.subscribers.delete(subscriber);
      },
      cancel: () => {
        unsubscribe?.();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }
}

class RouteError extends Error {
  readonly status: number;
  /** Optional machine-readable error kind (dashboard-settings typed validation:
   *  unknown_key / scope_not_allowed / invalid_value), mirrored onto the error
   *  envelope exactly as the live `api_error_kind` helper does. */
  readonly kind?: string;
  constructor(status: number, message: string, kind?: string) {
    super(message);
    this.status = status;
    this.kind = kind;
  }
}

/**
 * Validate a scoped-read's `scope` param (W02.P04.S15 retarget): the live
 * registry serves ANY vault-bearing worktree, not one frozen scope. An absent
 * scope is still a 400 (the read routes require it); a present-but-non-vault or
 * unknown token 400s honestly, exactly as the live `validate_scope` does.
 */
function requireScope(params: URLSearchParams): void {
  const scope = params.get("scope");
  if (!scope) throw new RouteError(400, "scope is required");
  if (!VAULT_BEARING_SCOPES.has(scope)) {
    throw new RouteError(400, `unknown or non-vault-bearing scope ${scope}`);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function bucketEvents(
  events: EngineEvent[],
  bucket: string,
): { from: string; to: string; counts_by_kind: Record<string, number> }[] {
  const sizeMs = bucket === "1h" ? 3600_000 : 24 * 3600_000; // auto/1d → daily
  const buckets = new Map<number, Record<string, number>>();
  for (const event of events) {
    const slot = Math.floor(Date.parse(event.ts) / sizeMs) * sizeMs;
    const counts = buckets.get(slot) ?? {};
    counts[event.kind] = (counts[event.kind] ?? 0) + 1;
    buckets.set(slot, counts);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([slot, counts_by_kind]) => ({
      from: new Date(slot).toISOString(),
      to: new Date(slot + sizeMs).toISOString(),
      counts_by_kind,
    }));
}

// --- app bootstrap installation ----------------------------------------------------

let instance: MockEngine | null = null;

/** The process-wide mock instance (created on first use). */
export function getMockEngine(): MockEngine {
  if (!instance) instance = new MockEngine();
  return instance;
}
