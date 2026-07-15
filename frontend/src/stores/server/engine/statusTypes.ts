// Decomposed from engine.ts (module-decomposition mandate, 2026-07-12).

import type { TiersBlock } from "./tiers";

// --- §6 status / ops ------------------------------------------------------------------

export interface EngineStatus {
  ok: boolean;
  nodes: number;
  edges: number;
  degradations: string[];
  tiers: TiersBlock;
  // The live `/status` git rollup (git-diff-browser ADR / mock-mirrors-live-wire-
  // shape): `dirty` is a BOOLEAN ("is the working tree dirty?"); the per-file
  // changed list + diff body are served separately by the read-only `/ops/git`
  // pass-through (porcelain status / numstat / unified diff). `ahead`/`behind` are
  // OPTIONAL: absent means "no upstream configured" (NOT zero), so divergence is
  // only shown when an upstream exists. `branch` is derived from the live `head_ref`.
  git?: { branch: string; ahead?: number; behind?: number; dirty: boolean };
  core?: { reachable: boolean; vault_health?: string };
  // `service` is the lifecycle word: now `running` / `crashed` / `absent`
  // (sourced from the live `/status` machine `state`), distinguishing a crashed
  // rag (discovered but not serving) from a genuinely absent one. `reason` is the
  // degraded explanation for crashed/absent. `isRagRunning(service)` still gates
  // on exactly `running`.
  rag?: {
    service: string;
    reason?: string;
    watcher?: string;
    index?: string;
    jobs?: number;
  };
}

export interface OpsResult {
  ok: boolean;
  envelope: unknown;
  tiers: TiersBlock;
}

/** rag's `GET /logs/json` envelope, forwarded verbatim by the brokered
 *  `/ops/rag/logs` read (rag-job-dashboard ADR D4). `lines` is an array of RAW,
 *  pre-formatted log-line strings — rag emits formatted text, not structured
 *  records, so a level word and a leading timestamp (when present) are parsed out
 *  of each string downstream (`parseRagLogLine` in `ragControl`). `total` is the
 *  returned-line count; `filters` echoes the applied `lines`/`job_id` filter.
 *  Deliberately tolerant: a shape drift degrades to an empty tail, never a throw
 *  (engine-read-and-infer corollary). Lives beside the ops wire family here (not
 *  with the rag-control envelopes in `ragControl.ts`) so the low-level client
 *  method stays typed without a client↔stores import cycle. */
export interface RagLogsEnvelope {
  lines: string[];
  total?: number;
  filters?: { job_id?: string; lines?: number };
}

// --- §6 vault maintenance ops (document-editor backend) --------------------------
//
// Feature-archive and conformance-autofix go through the engine's brokered
// core-ops front door, which forwards vaultspec-core's sibling `{schema, status,
// data}` envelope VERBATIM under `data.envelope` with the tiers block
// (engine-read-and-infer: the engine owns no vault-write semantics — it forwards
// core's verb result). Archive hits `POST /ops/core/archive`; autofix hits
// `POST /ops/core/autofix`. BOTH success and business-refusal return HTTP 200 —
// the client branches on the sibling envelope's `status` + the inner
// `conflict`/`refused`/`checks` fields, NEVER on the HTTP code (a transport error
// is a tiers-bearing EngineError, distinct from a refusal).
//
// Every genuine document CONTENT edit (set-body/set-frontmatter/rename/create/
// relate-link) is ledgered instead (`stores/server/authoring.ts` `directWrite()`)
// — the `write`/`create`/`link` verbs this seam used to carry are RETIRED
// (ledgered-edit-migration W04.P12). Archive and autofix are DELIBERATELY
// retained here: per the ADR, a multi-document archive and a bulk no-single-
// target autofix don't fit the per-document V1 changeset shape, so they stay
// vault-maintenance operations, never ledgered.

/** The body of a feature-archive op (`POST /ops/core/archive`). */
export interface OpsArchiveBody {
  scope?: string;
  feature: string;
}

/** The body of a conformance-autofix op (`POST /ops/core/autofix` →
 *  `vault check all --fix --feature <tag>`). Feature-scoped. */
export interface OpsAutofixBody {
  scope?: string;
  feature: string;
}

/**
 * The typed, discriminated result of a document write/create — the shared
 * result vocabulary the ledgered direct-write stores mutations
 * (`useSaveBody`/`useSetFrontmatter`/`useCreateDoc`, `stores/server/queries.ts`
 * `directWriteResultToOpsResult`) map their outcome onto, and the editor
 * lifecycle (`stores/view/editor.ts` `EditorWriteResult`) consumes. Predates the
 * ledger (originally interpreted from the legacy `/ops/core/{verb}/write` sibling
 * envelope by the now-retired `adaptOpsWrite`, ledgered-edit-migration W04.P12);
 * kept as the shape itself, still live and load-bearing. Four outcomes:
 *  - `saved`    — a body/frontmatter save succeeded; the new `blobHash` is the
 *                 next optimistic-concurrency base, and `checks` carries any
 *                 non-fatal advisory checks. Consumed by the editor save
 *                 lifecycle.
 *  - `conflict` — the `expected_blob_hash` did not match the on-disk blob
 *                 (someone else wrote); `expected`/`actual` drive the editor
 *                 reconcile UI.
 *  - `refused`  — a validation refusal or denial; `checks`/`errors` explain why
 *                 the write was rejected without parsing prose.
 *  - `created`  — a `create` succeeded; the new doc's `path` + `stem`. Consumed
 *                 by the create-doc flow, not by the editor save lifecycle.
 */
export type OpsWriteResult =
  | { kind: "saved"; path: string; blobHash: string; checks: unknown[] }
  | { kind: "conflict"; expected: string; actual: string; path?: string }
  | { kind: "refused"; checks: unknown[]; errors: string[]; path?: string }
  | { kind: "created"; path: string; stem: string };

/** Narrow the sibling envelope (`{schema, status, data}`) the engine forwards
 *  verbatim under `data.envelope`. The transport already unwrapped `{data, tiers}`
 *  onto the flat `OpsResult` shape, so `envelope` here is that sibling object.
 *  Still used by the RETAINED maintenance ops (archive/autofix,
 *  `menuActionOutcome.ts`'s `opsRefusalReason`) — every content-edit consumer
 *  that used to read it (the legacy write/create path) is ledgered now. */
export function envelopeData(envelope: unknown): {
  status?: string;
  data: Record<string, unknown>;
} {
  if (!envelope || typeof envelope !== "object") return { data: {} };
  const env = envelope as { status?: unknown; data?: unknown };
  const status = typeof env.status === "string" ? env.status : undefined;
  const data =
    env.data && typeof env.data === "object"
      ? (env.data as Record<string, unknown>)
      : {};
  return { status, data };
}

// --- read-only /ops/git pass-through (dashboard-pipeline-wire W04) ---------------------
//
// The live engine NOW serves a read-only `/ops/git/{verb}` pass-through (POST):
// porcelain `status`, `numstat`, unified `diff` for a path, and two-rev
// `histdiff`, forwarded VERBATIM inside the shared `{data: {verb, output}, tiers}`
// envelope. The engine implements NO diff algorithm and exposes NO mutating git
// verb - the whitelist is read-only by construction (`engine-read-and-infer`).
// `output` is git's raw text; the client parses it (the structured `GitFileDiff`
// below is the parse target the DiffView renders).

/** The raw `/ops/git/{verb}` pass-through envelope shape: the verb echoed back
 *  and git's output forwarded verbatim. `verb` is `status` | `numstat` | `diff`
 *  | `histdiff`. */
export interface GitOpResponse {
  verb: string;
  /** Git's stdout, forwarded verbatim (porcelain status / numstat / unified diff). */
  output: string;
  /** Adapter-side cap marker when the raw git stdout exceeded the stores boundary. */
  truncated?: { returned_chars: number; reason: string };
  tiers: TiersBlock;
}

/** The engine-reduced changed-files rollup served by `/ops/git/changes-summary`
 *  (changes-summary-projection): the five numbers the collapsed "Changes" fold
 *  header renders, computed engine-side over the SAME porcelain status + numstat
 *  reads the full list parses — so a cold load that only shows the header need
 *  not ship the raw git text. `documents` counts changed paths under `.vault/`,
 *  `files` the rest; `additions`/`deletions` sum the numstat tallies over the
 *  changed set (binary/untracked entries contribute 0). */
export interface GitChangesSummary {
  files: number;
  documents: number;
  additions: number;
  deletions: number;
  /** True when the working tree carries no reportable change. */
  clean: boolean;
  tiers: TiersBlock;
}

// --- provisioning plane wire shapes (project-provisioning ADR) -----------------
//
// Backend-served truth: the engine computes every field, the panel renders it.
// Deliberately tolerant on nested/optional fields — a new served field is
// additive, not a break (engine-read-and-infer corollary).

/** The one served decision: what, if anything, the target needs next. Ordered by
 *  dependency so the panel can render a single primary affordance. */
export type ProvisionRecommendation =
  | "not-a-git-project"
  | "acquire-uv"
  | "acquire-core"
  | "install-framework"
  | "run-migrations"
  | "upgrade-core"
  | "managed";

/** `GET /provision/status` projection over a registry-resolved target. */
export interface ProvisionStatus {
  target: string;
  managed: boolean;
  recommended: ProvisionRecommendation;
  git: { present: boolean };
  uv: { present: boolean; version: string | null };
  core: { version: string | null; floor: string; meets_floor: boolean | null };
  rag: { tool_version: string | null; floor: string; enrolled: boolean | null };
  framework: {
    vaultspec_present: boolean;
    vault_present: boolean;
    providers: string[];
  };
  pending_migrations: unknown;
}

/** The bounded `POST /provision/run` body: a semantic action plus typed operands.
 *  The engine maps this to a fixed installer argv; no wire string reaches argv. */
export interface ProvisionRunBody {
  action: "install" | "upgrade" | "migrate" | "acquire";
  provider?: "all" | "core" | "claude" | "gemini" | "antigravity" | "codex";
  tool?: "core" | "rag";
  upgrade?: boolean;
  force?: boolean;
  /** Required (`"confirm-force"`) when `force` is set, else the engine refuses. */
  confirm?: string;
  workspace?: string;
  worktree?: string;
}

/** A tracked provisioning job as `POST /provision/run` and `GET /provision/jobs/
 *  {id}` report it. `outcome` carries the sibling's verbatim envelope (core) or
 *  raw output (uv) plus `outcome_indeterminate` when a killed job's post-state
 *  must be re-read from `/provision/status`. */
export interface ProvisionJob {
  id: string;
  label: string;
  target: string;
  state: "running" | "succeeded" | "failed";
  outcome: {
    exit_code?: number | null;
    outcome_indeterminate?: boolean;
    envelope?: { schema?: string; status?: string; [k: string]: unknown };
    output?: string;
  } | null;
}

// The structured shapes below are the `DiffView` component's prop contract — what
// the client parses git's verbatim `diff` output INTO so the view renders without
// re-parsing unified-diff text on every paint. A hunk-per-entry document with
// twin (old/new) line numbers and an explicit per-line change type.

/** A single changed line within a hunk. `kind` is the non-color identity. */
export interface GitDiffLine {
  kind: "add" | "remove" | "context";
  /** Old-side line number; null on an added line. */
  old?: number | null;
  /** New-side line number; null on a removed line. */
  new?: number | null;
  text: string;
}

/** One hunk: its `@@` range header and the lines it carries. */
export interface GitDiffHunk {
  header: string;
  lines: GitDiffLine[];
}

/**
 * The structured read-only diff for one changed file — the `DiffView` prop
 * contract, parsed from git's verbatim `diff` output by `parseUnifiedDiff`.
 */
export interface GitFileDiff {
  path: string;
  /** Git status letter for the entry (A/M/D/R/?) — the non-color status mark. */
  status?: string;
  hunks: GitDiffHunk[];
  /** True when there is no textual diff (binary blob or a pure rename). */
  binary?: boolean;
  /** Honest truncation, when the engine capped an oversized body. */
  truncated?: { total_hunks: number; returned_hunks: number; reason: string };
}

// --- changed-files list (parsed from porcelain status + numstat) ----------------------
//
// The status-grouped changed-files list the `ChangesOverview` renders, parsed by
// `parseGitStatus` / `parseGitNumstat` from the verbatim porcelain-v1 + numstat
// output the `/ops/git` pass-through forwards. The flat porcelain `XY path` and
// numstat `adds\tdels\tpath` lines are reconciled into one entry per changed file.

/** The status groups the changed-files list buckets entries into, ordered as the
 *  surface renders them. `staged` carries an index-side change (porcelain X), the
 *  rest a worktree-side change (porcelain Y). */
export type GitChangeGroup =
  | "staged"
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked";

/** One changed file in the working tree, reconciled from porcelain status and
 *  numstat. `code` is the raw two-char porcelain `XY` (the non-color identity);
 *  `adds`/`dels` are the numstat tallies (null for a binary file). */
export interface ChangedFile {
  path: string;
  /** The porcelain two-character `XY` status code (e.g. ` M`, `A `, `??`). */
  code: string;
  /** The single status letter shown as the grayscale-safe mark (M/A/D/R/?). */
  letter: string;
  /** Which status group the entry buckets into. */
  group: GitChangeGroup;
  /** numstat additions; null for a binary file or an entry with no numstat row. */
  adds: number | null;
  /** numstat deletions; null for a binary file or an entry with no numstat row. */
  dels: number | null;
  /** True when numstat reported the entry binary (`-\t-`) — distinct from an
   *  untracked entry, which has no numstat row at all and leaves tallies null
   *  WITHOUT being binary. Lets the UI label binary vs untracked honestly. */
  binary?: boolean;
  /** True when the entry is under the `.vault/` corpus. */
  vault: boolean;
}

// --- in-flight pipeline projection (dashboard-pipeline-wire W02) -----------------------
//
// The Work pillar's data: active plans (by lifecycle) and in-flight ADRs (by
// status) in scope, each with progress, status/tier, pipeline phase, and a
// stable node id. Bounded to active artifacts by construction. Wire shapes stay
// snake_case as the live `/pipeline` route serves them under `{data, tiers}`.

/** The pipeline phase an artifact sits in (research → adr → plan → execute →
 *  review), derived engine-side from doc_type and status. */
export type PipelinePhase = "research" | "adr" | "plan" | "execute" | "review";

/** One in-flight pipeline artifact (GET /pipeline data.artifacts). */
export interface PipelineArtifact {
  node_id: string;
  stem: string;
  title?: string;
  doc_type?: string;
  /** ADR status; absent on plans. */
  status?: string;
  /** Plan tier; absent on ADRs. */
  tier?: string;
  /** Plan checkbox progress; absent on ADRs. */
  progress?: { done: number; total: number };
  /**
   * The artifact's feature tags (dashboard-pipeline-status W01): the ADR row's
   * feature label is read from here. Truthful absence — forwarded only when the
   * doc node carries it.
   */
  feature_tags?: string[];
  /**
   * The doc node's created/modified dates (dashboard-pipeline-status W01): the
   * row's freshness stamp is derived from `modified`. Truthful absence — the
   * stamp is hidden when dates are not served.
   */
  dates?: { created?: string; modified?: string };
  phase: PipelinePhase;
}

/** The in-flight pipeline projection (GET /pipeline data). */
export interface PipelineResponse {
  artifacts: PipelineArtifact[];
  tiers: TiersBlock;
}

// --- bounded plan-container interior (dashboard-pipeline-wire W03) ---------------------
//
// The Work pillar's step tree: a plan node's wave → phase → step interior, each
// step bearing completion and the bound exec record, under a node ceiling with
// honest `truncated`. Tier-shape honest: an L1 plan returns flat `steps`, an L2
// plan `phases`, L3/L4 `waves`. Served by `/nodes/{id}/plan-interior`.

export interface InteriorStep {
  node_id: string;
  id: string;
  action?: string;
  done: boolean;
  /** The exec-record document node this step binds to, if any. */
  exec_node_id?: string;
}

/** A done/total completion rollup over a container's full step subtree, served by
 *  the engine (computed pre-truncation, so honest even when the interior is capped).
 *  The client renders this — it never re-counts steps over a possibly-truncated tree
 *  (`display-state-is-backend-served-not-frontend-derived`). */
export interface InteriorRollup {
  done: number;
  total: number;
}

export interface InteriorPhase {
  node_id: string;
  id: string;
  heading?: string;
  steps: InteriorStep[];
  rollup: InteriorRollup;
}

export interface InteriorWave {
  node_id: string;
  id: string;
  heading?: string;
  phases: InteriorPhase[];
  rollup: InteriorRollup;
}

/** The engine-derived per-plan structural summary (counts + completion state),
 *  computed over the FULL plan tree pre-truncation. `plan_state` is the one
 *  `not-started`/`in-progress`/`finished` authority (absent when the plan has no
 *  steps). The reader's summary card reads these served values. */
export interface PlanSummary {
  wave_count: number;
  phase_count: number;
  step_count: number;
  done_count: number;
  plan_state?: string | null;
}

/** The bounded plan-container interior (GET /nodes/{id}/plan-interior data.interior). */
export interface PlanInterior {
  plan_node_id: string;
  waves: InteriorWave[];
  phases: InteriorPhase[];
  steps: InteriorStep[];
  summary: PlanSummary;
  truncated?: { total_nodes: number; returned_nodes: number; reason: string } | null;
}

export interface PlanInteriorResponse {
  interior: PlanInterior;
  tiers: TiersBlock;
}

// --- §8 search ---------------------------------------------------------------------------

export interface SearchResult {
  score: number;
  /** The corpus the hit came from (`vault` | `codebase`) — NOT the identity. The
   *  human identity is `title` (the doc H1) and the click-through is `node_id`. */
  source: string;
  /** The human title the rag wire carries (the document's H1 / the code symbol or
   *  file) — the pill's primary line. Absent on the text-match fallback. */
  title?: string;
  /** Short preview line (rag `snippet`/`excerpt`/`text`) — the Compact pill's body. */
  excerpt?: string;
  /** Full reranker context body (rag `rerank_text`) — the editorial long-form source. */
  rerank_text?: string;
  // Vault metadata (present for `source: "vault"` hits; mirrors the rag wire verbatim).
  doc_type?: string;
  feature?: string;
  date?: string;
  // Code metadata (present for `source: "codebase"` hits).
  language?: string;
  line_start?: number;
  line_end?: number;
  node_type?: string;
  function_name?: string;
  class_name?: string;
  /** The engine's value-add: results click through into the graph. */
  node_id: string | null;
}

/**
 * rag's native per-search freshness block (rag-integration-hardening ADR D3),
 * forwarded VERBATIM by the engine on every `/search` success — the engine adds
 * no staleness semantics of its own (engine-read-and-infer). Every field is
 * optional so a sparse or older rag shape never breaks adaptation; consumers
 * read freshness from this served truth, presentation-mapped only.
 */
export interface SearchIndexState {
  /** The corpus this block describes (`vault` | `codebase`). */
  source?: string;
  /** Points indexed for the requested target. */
  indexed_count?: number;
  vault_count?: number;
  code_count?: number;
  /** The root rag actually indexed, vs the root the engine requested. When they
   *  disagree (`target_matches === false`) the served results are for a different
   *  root than the one asked for — a staleness the consumer can surface. */
  indexed_target_root?: string;
  requested_target_root?: string;
  target_matches?: boolean;
  /** rag's own index status word (e.g. `available`, `indexing`). */
  status?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  tiers: TiersBlock;
  /** rag's freshness block, forwarded verbatim (ADR D3). Absent when the wire
   *  carried no `index_state` (e.g. a degraded or empty search). */
  index_state?: SearchIndexState;
  /**
   * The shared D4 semantic-index epoch the engine annotates on every success:
   * a number when the short-TTL cache was warm, `null` when it was cold (an
   * HONEST absent marker — freshness unknown, never a fabricated `0`), and
   * `undefined` when the field was absent from the wire entirely (the degraded
   * path emits no epoch). Downstream builds key one invalidation across search
   * and embeddings on this value.
   */
  semantic_epoch?: number | null;
}

// --- session / settings (user-state-persistence W04.P08.S25) -----------------------------
//
// The orchestration crate's session/settings surface (the "builds beside" layer,
// foundation contract §9). Wire shapes stay snake_case exactly as the live
// `vaultspec-session`-backed routes serve them under the shared `{data, tiers}`
// envelope. This is the durable, session-defining state — active scope, the
// active folder + its feature-tag contexts, recents, and user settings — that
// survives a reload; ephemeral view state stays in localStorage.

/** A scope's persisted folder + feature-tag context (GET /session). `folder` is
 *  null when no folder is selected; `feature_tags` is the grouping primitive the
 *  "current folder + contexts" projection is built on (never a new node model). */
export interface ScopeContextWire {
  folder: string | null;
  feature_tags: string[];
  /** The serialized dock workspace layout (editor-dock-workspace): an opaque JSON
   *  string carrying the open-document tab set + active tab for this scope.
   *  Persisted in the DURABLE per-scope session blob (SQLite-backed), so the
   *  workspace restores across reloads AND engine restarts. Absent until the
   *  workspace first persists a layout. */
  workspace_layout?: string;
}

/** One entry of the machine-global, cross-project recents (GET /session
 *  `recent_scopes`): a worktree `scope` the operator navigated to, attributed to
 *  its registry `workspace` so the dashboard renders one unified "Recent" list
 *  spanning every project the way every editor does. */
export interface RecentScope {
  workspace: string;
  scope: string;
}

/** The current session: the "where am I and what am I looking at" the dashboard
 *  restores on load instead of recomputing a default (GET/PUT /session data). */
export interface SessionState {
  workspace: string;
  active_scope: string;
  /** The active WORKSPACE id beside the active scope (dashboard-workspace-
   *  registry ADR): the registered root the dashboard is pointed at, or null
   *  when none is selected yet. */
  active_workspace: string | null;
  scope_context: ScopeContextWire;
  /** The active workspace's per-workspace recents (legacy, scope-only). */
  recents: string[];
  /** The machine-global cross-project recents (most-recent-first), each entry
   *  attributed to its workspace. The unified "Recent" list the picker renders.
   *  Optional so minimal session fixtures need not construct it; the live adapter
   *  always populates it, and consumers default to an empty list. */
  recent_scopes?: RecentScope[];
  tiers: TiersBlock;
}

/** The scope-context part of a PUT /session body. `scope` selects which scope
 *  the context belongs to (absent = the active scope); an absent or null
 *  `folder` clears it; `feature_tags` is set wholesale. */
export interface ScopeContextUpdate {
  scope?: string;
  folder?: string | null;
  feature_tags?: string[];
}

/** The dock workspace-layout part of a PUT /session body (editor-dock-workspace).
 *  `scope` selects the scope (absent = active); `layout` is the opaque serialized
 *  layout blob, or null to clear it. Applied as a MERGE into the scope's session
 *  context, so it preserves the folder + feature-tag context (and vice versa). */
export interface WorkspaceLayoutUpdate {
  scope?: string;
  layout?: string | null;
}

/** A partial session update (PUT /session): any absent field leaves that part of
 *  the session untouched. An unknown `active_scope` is a tiered 400 and leaves the
 *  active scope unchanged. The registry-mutation fields (dashboard-workspace-
 *  registry ADR) ride the same config surface: `active_workspace` selects the
 *  active root (an unregistered id is a tiered 400), `add_workspace` registers an
 *  operator-supplied path read-only (an invalid path is a tiered 400), and
 *  `forget_workspace` removes a root (the last launch root is refused). */
export interface SessionUpdate {
  active_scope?: string;
  scope_context?: ScopeContextUpdate;
  /** Persist the dock workspace layout for a scope (editor-dock-workspace),
   *  merged into the durable per-scope session context. */
  set_workspace_layout?: WorkspaceLayoutUpdate;
  push_recent?: string;
  active_workspace?: string;
  add_workspace?: string;
  forget_workspace?: string;
  /** History CRUD (cross-project recents): remove ONE `(workspace, scope)` entry
   *  from the machine-global recents, or clear the whole list. Config deletes
   *  only — they prune the recent history and never touch a repository. */
  remove_recent_scope?: RecentScope;
  clear_recent_scopes?: boolean;
}

/** User settings (GET/PUT /settings data): a flat `global` map plus a per-scope
 *  `scoped` map. `scoped` sparse-omits scopes with no scoped keys. */
export interface SettingsState {
  global: Record<string, string>;
  scoped: Record<string, Record<string, string>>;
  tiers: TiersBlock;
}

/** A single settings write (PUT /settings body): a key/value pair, global when
 *  `scope` is absent, scope-scoped otherwise. */
export interface SettingUpdate {
  scope?: string;
  key: string;
  value: string;
}

// --- settings schema (dashboard-settings W01/W02) -----------------------------
//
// The engine-owned settings registry served by GET /settings/schema: the single
// source of truth the client renders controls and synthesizes defaults from. The
// wire stays string-valued (the {global, scoped} maps above); these types carry
// the TYPING + UI hints so the dialog renders schema-driven controls and the
// effective-value selector decodes by declared type. Shapes mirror the live
// `vaultspec_session::settings_schema` serialization exactly (snake_case, the
// tagged `value_type`).

/** A setting's value type + constraints (the tagged `value_type`). The client
 *  decodes the string wire value by this and validates optimistically. */
export type SettingValueType =
  | { type: "enum"; members: string[] }
  | { type: "bool" }
  | { type: "string"; max_len: number }
  | { type: "integer"; min: number; max: number }
  // The keybinding override map (keyboard-action-system W02): the value is a JSON
  // OBJECT STRING `{action_id: chord}`, bounded by `max_entries`
  // (bounded-by-default-for-every-accumulator). The client decodes it into a
  // `KeybindingOverrides` map; the engine enforces the same entry cap.
  | { type: "keybindings"; max_entries: number }
  // A sparse GRAPH-CONTROL override map (graph-control-standardisation): a JSON
  // OBJECT STRING `{control_id: number|string}`, bounded by `max_entries`. The
  // frontend `graphControlSchema` owns the control vocabulary + ranges; the engine
  // keeps the value well-formed + bounded. Decoded by `parseGraphControlOverrides`.
  | { type: "graph_controls"; max_entries: number }
  | { type: "section_folds"; max_entries: number };

/** The UI control a setting renders as (the schema-driven render hint). The
 *  `keybinding` kind renders the chord-recorder catalog (KeybindingControl). */
export type SettingControlKind =
  | "segmented"
  | "switch"
  | "text"
  | "slider"
  | "keybinding"
  // Edited from the graph-controls overlay panel, NOT the settings dialog — the
  // dialog SKIPS this control kind (graph-control-standardisation).
  | "graph_controls"
  | "section_folds";

export type SettingGroupId = "appearance" | "graph" | "keybindings";

export type SettingDisplayId =
  | "appearance.theme"
  | "appearance.reduceMotion"
  | "appearance.activitySectionFolds"
  | "appearance.language"
  | "graph.defaultGranularity"
  | "graph.corpus"
  | "graph.timelineDate"
  | "graph.confidenceFloor"
  | "graph.labelFilter"
  | "graph.controls"
  | "keybindings.shortcuts";

export type SettingEnumDisplayId =
  | "theme.system"
  | "theme.light"
  | "theme.dark"
  | "theme.highContrast"
  | "language.system"
  | "language.english"
  | "granularity.feature"
  | "granularity.document"
  | "corpus.vault"
  | "corpus.code"
  | "timelineDate.created"
  | "timelineDate.modified"
  | "timelineDate.stamped";

export interface SettingEnumDisplay {
  value: string;
  id: SettingEnumDisplayId;
}

export interface SettingDisplay {
  id: SettingDisplayId;
  group: SettingGroupId;
  enum_members: SettingEnumDisplay[];
}

/** One declared setting (GET /settings/schema data.settings[]). */
export interface SettingDef {
  key: string;
  value_type: SettingValueType;
  /** The default wire value (string form) when no row exists. */
  default: string;
  /** Whether a per-scope override is allowed (false = global only). */
  scope_eligible: boolean;
  control: SettingControlKind;
  display: SettingDisplay;
  order: number;
  /** Slider step (slider controls only). */
  step?: number;
  /** Unit suffix for display, e.g. "%" (slider controls only). */
  unit?: string;
}

/** The served settings schema (GET /settings/schema data): the declared settings
 *  plus the engine-owned group display order. */
export interface SettingsSchema {
  settings: SettingDef[];
  groups: SettingGroupId[];
  tiers: TiersBlock;
}
