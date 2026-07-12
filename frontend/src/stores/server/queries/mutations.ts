// Auto-split from queries.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the queries barrel; see ./index.ts.

import { normalizeNodeId } from "../../nodeIds";
import {
  authoringClient,
  requireActorToken,
  type DirectWriteOutcome,
} from "../authoring";
import type { OpsWriteResult, TiersBlock } from "../engine";
import { docNodeIdFromStem } from "../liveAdapters";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  GRAPH_GENERATION_QUERY_SUBTREES,
  engineKeys,
  normalizeGitDiffArg,
} from "./internal";
import { normalizeSearchScope } from "./timeline-search";

// --- document write/create mutations (document-editor backend) -------------------
//
// Save, frontmatter, rename, and create ALL route through the authoring
// ledger's `directWrite` route (`operation: "replace_body"` /
// `"edit_frontmatter"` / `"rename"` / `"create_document"`,
// ledgered-edit-migration W01.P02 / W03.P07 / W03.P08 / W03.P09) — a
// self-approving direct changeset, not the legacy `/ops/core` ops-dispatch
// seam. `directWriteResultToOpsResult` maps the body/frontmatter outcome onto
// the SAME `OpsWriteResult` shape the editor lifecycle already consumes
// (`applyEditorWriteResult`); rename and create each map their own outcome
// shape locally (`RenameDocResult`, `OpsWriteResult`'s `created` variant). Every
// direct-write kind PINS the doc's `scope`, so a mutation that races a
// scope-switch is refused rather than silently landing in the wrong worktree.
// Only `archive`/`link` (feature-archive, relate) still dispatch through the
// legacy `dispatchOps` seam — the ops-dispatch write mode itself is now dead
// in practice (no live caller), left alive per the ADR's staged W04 removal.
//
// Either way, a conflict/refusal is a typed result the caller drives editor state
// from — NOT a thrown error — so the mutation resolves (never rejects) on a
// business outcome; only a transport fault (a tiers-bearing EngineError) or the
// actor-token fail-safe (`requireActorToken`, no identity bootstrapped) rejects.
// Concurrency rides the read's echoed `blob_hash`; degradation is read from the
// result's tiers, never guessed from transport
// (degradation-is-read-from-tiers-not-guessed-from-errors).

/** Strip the `doc:` prefix from a node id to recover the document STEM the write
 *  ops address by (`ref`). A non-`doc:` id passes through unchanged so a caller
 *  that already holds a bare stem is tolerated. */
export function stemFromNodeId(nodeId: string): string {
  return nodeId.startsWith("doc:") ? nodeId.slice("doc:".length) : nodeId;
}

/** The arguments to a body save: the open doc's node id + scope, the new text, and
 *  the optimistic-concurrency base (the `blob_hash` the draft was read at). */
export interface SaveBodyArgs {
  nodeId: unknown;
  scope: unknown;
  text: unknown;
  baseBlobHash: unknown;
}

interface WriteArgsRecord {
  [key: string]: unknown;
}

function writeArgsRecord(value: unknown): WriteArgsRecord {
  return value !== null && typeof value === "object" ? (value as WriteArgsRecord) : {};
}

function normalizeWriteText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeWriteOptionalString(value: unknown): string | undefined {
  return normalizeGitDiffArg(value) ?? undefined;
}

function normalizeWriteStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized: string[] = [];
  for (const entry of value) {
    const text = normalizeGitDiffArg(entry);
    if (text !== null) normalized.push(text);
  }
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeWriteRef(nodeId: unknown): {
  nodeId: string | null;
  ref: string | null;
} {
  const normalizedNodeId = normalizeNodeId(nodeId);
  return {
    nodeId: normalizedNodeId,
    ref: normalizedNodeId === null ? null : stemFromNodeId(normalizedNodeId),
  };
}

function refusedWriteResult(error: string): {
  result: OpsWriteResult;
  tiers: TiersBlock;
} {
  return {
    result: { kind: "refused", checks: [], errors: [error] },
    tiers: {},
  };
}

export interface NormalizedSaveBodyArgs {
  scope: string | null;
  nodeId: string | null;
  ref: string | null;
  text: string;
  baseBlobHash: string;
}

export function normalizeSaveBodyArgs(args: unknown): NormalizedSaveBodyArgs {
  const value = writeArgsRecord(args);
  const identity = normalizeWriteRef(value.nodeId);
  return {
    scope: normalizeGitDiffArg(value.scope),
    nodeId: identity.nodeId,
    ref: identity.ref,
    text: normalizeWriteText(value.text),
    baseBlobHash: normalizeWriteText(value.baseBlobHash),
  };
}

function invalidateQueryPrefix(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
): void {
  void queryClient.invalidateQueries({ queryKey, exact: false });
}

function invalidateScopedStreams(queryClient: QueryClient, scope: string): void {
  void queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      return (
        key[0] === engineKeys.all[0] &&
        key[1] === "stream" &&
        key[key.length - 1] === scope
      );
    },
  });
}

function invalidateScopedQuerySubtree(
  queryClient: QueryClient,
  subtree: (typeof GRAPH_GENERATION_QUERY_SUBTREES)[number],
  scope: string,
): void {
  if (subtree === "stream") {
    invalidateScopedStreams(queryClient, scope);
    return;
  }
  invalidateQueryPrefix(queryClient, [...engineKeys.all, subtree, scope]);
}

function invalidateGraphGenerationSubtrees(
  queryClient: QueryClient,
  scope: string,
): void {
  for (const subtree of GRAPH_GENERATION_QUERY_SUBTREES) {
    invalidateScopedQuerySubtree(queryClient, subtree, scope);
  }
}

/**
 * Invalidate every read surface a successful vault mutation can stale. A write or
 * create changes the document bytes, the current graph generation, the vault/code
 * tree projections, git dirty/change reads, and any graph-derived node/search
 * projections. Centralizing the sweep keeps save/frontmatter/create enrolled in
 * the same stack-managed refresh boundary.
 */
export function invalidateAfterVaultMutation(
  queryClient: QueryClient,
  scope: unknown,
  nodeId?: unknown,
): void {
  const normalizedScope = normalizeGitDiffArg(scope);
  const normalizedNodeId = normalizeNodeId(nodeId);
  if (normalizedScope !== null && normalizedNodeId !== null) {
    void queryClient.invalidateQueries({
      queryKey: engineKeys.content(normalizedScope, normalizedNodeId),
    });
  }

  void queryClient.invalidateQueries({ queryKey: engineKeys.status() });
  void queryClient.invalidateQueries({ queryKey: engineKeys.map() });

  if (normalizedScope === null) {
    invalidateQueryPrefix(queryClient, [...engineKeys.all, "search"]);
    return;
  }

  invalidateGraphGenerationSubtrees(queryClient, normalizedScope);
  void queryClient.invalidateQueries({
    queryKey: engineKeys.gitChanges(normalizedScope),
  });
  void queryClient.invalidateQueries({
    queryKey: engineKeys.gitChangesSummary(normalizedScope),
  });
  invalidateQueryPrefix(queryClient, [...engineKeys.all, "file-tree", normalizedScope]);
  invalidateQueryPrefix(queryClient, [...engineKeys.all, "git-diff", normalizedScope]);
  invalidateQueryPrefix(queryClient, [
    ...engineKeys.all,
    "git-histdiff",
    normalizedScope,
  ]);
}

/**
 * Invalidate graph-generation projections after an external watcher rebuild or
 * graph stream recovery. This is narrower than a local vault mutation because it
 * does not imply a local git/status write, but the graph-derived readers must all
 * re-read from the new generation rather than keeping stale node/tree/facet
 * projections.
 */
export function invalidateGraphGenerationReads(
  queryClient: QueryClient,
  scope: unknown,
): void {
  const normalizedScope = normalizeGitDiffArg(scope);
  if (normalizedScope !== null) {
    invalidateGraphGenerationSubtrees(queryClient, normalizedScope);
  }
}

/**
 * Backend `git` signal recovery invalidation. `/status` carries the dirty/ahead
 * rollup, while `/ops/git/status|numstat|diff|histdiff` and `/history` are
 * separate scoped projections. A git stream frame means the rollup, per-scope git
 * reads, and commit history may be stale, so refresh them from the same
 * stores-owned recovery seam.
 */
export function invalidateGitRecoveryReads(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: engineKeys.status() });
  invalidateQueryPrefix(queryClient, [...engineKeys.all, "git-changes"]);
  invalidateQueryPrefix(queryClient, [...engineKeys.all, "git-changes-summary"]);
  invalidateQueryPrefix(queryClient, [...engineKeys.all, "git-diff"]);
  invalidateQueryPrefix(queryClient, [...engineKeys.all, "git-histdiff"]);
  invalidateQueryPrefix(queryClient, [...engineKeys.all, "history"]);
}

/**
 * Invalidate semantic consumers for one scope after rag lifecycle or index
 * freshness changes. Search results and graph embeddings are the two scoped
 * client-side semantic caches; callers must not hand-compose these families.
 */
export function invalidateScopedSemanticReads(
  queryClient: QueryClient,
  scope: unknown,
): void {
  const normalizedScope = normalizeSearchScope(scope);
  if (normalizedScope === null) return;
  invalidateQueryPrefix(queryClient, [...engineKeys.all, "search", normalizedScope]);
  invalidateQueryPrefix(queryClient, [
    ...engineKeys.all,
    "graph-embeddings",
    normalizedScope,
  ]);
}

/**
 * Map a `directWrite` outcome onto the shared `OpsWriteResult` shape the editor
 * save lifecycle already consumes (`applyEditorWriteResult`), so the Save
 * button's cutover to the ledgered route is invisible to the view layer above
 * this store. The direct-write conflict's `target_blob_hash` (the blob the save
 * would have produced had the base still matched) is not carried through — the
 * editor conflict UX has only ever rendered `expected`/`actual`.
 *
 * A `refused` result's reason rides BOTH `errors` and `checks` — the editor's
 * advisories panel (`conformanceChecksOf`, stores/view/editor.ts) reads only
 * `checks`, mirroring the one-entry `{severity, message, fixable}` shape
 * `applyRenameEditorResult`'s collision branch already uses — so a denied
 * (e.g. a scope-pin mismatch, a non-human actor) or failed direct write is
 * never a silently blank advisories panel.
 */
function directWriteRefusedResult(reason: string): OpsWriteResult {
  return {
    kind: "refused",
    checks: [{ severity: "error", message: reason, fixable: false }],
    errors: [reason],
  };
}

function directWriteResultToOpsResult(outcome: DirectWriteOutcome): {
  result: OpsWriteResult;
  tiers: TiersBlock;
} {
  if (outcome.kind === "applied") {
    return {
      result: {
        kind: "saved",
        path: outcome.documentPath ?? "",
        blobHash: outcome.blobHash ?? "",
        checks: [],
      },
      tiers: outcome.tiers,
    };
  }
  if (outcome.kind === "conflict") {
    return {
      result: {
        kind: "conflict",
        expected: outcome.conflict.expected_blob_hash,
        actual: outcome.conflict.actual_blob_hash,
        path: outcome.conflict.document_path,
      },
      tiers: outcome.tiers,
    };
  }
  if (outcome.kind === "denied") {
    return {
      result: directWriteRefusedResult(
        outcome.reason ?? "the direct editor save was denied",
      ),
      tiers: outcome.tiers,
    };
  }
  if (outcome.kind === "failed") {
    return {
      result: directWriteRefusedResult(
        outcome.reason ?? "the direct editor save failed",
      ),
      tiers: outcome.tiers,
    };
  }
  if (outcome.kind === "in_flight") {
    return {
      result: directWriteRefusedResult(
        "a prior save for this document is still in flight — try again shortly",
      ),
      tiers: outcome.tiers,
    };
  }

  const exhaustive: never = outcome;
  return exhaustive;
}

/**
 * Save the open document's body through the authoring ledger's `directWrite`
 * route (`operation: "replace_body"`, ledgered-edit-migration W01.P02 /
 * W02.P06) — a self-approved direct changeset, not the legacy `set-body` ops
 * dispatch. Sends the open doc's `scope` as the direct-write scope PIN, so a
 * save that races a scope-switch is refused as a redacted denial rather than
 * silently landing in the wrong worktree. Resolves with the typed
 * `OpsWriteResult` — a `conflict` (the optimistic blob-hash base went stale) or a
 * `refused` (a validation rejection, denial, or in-flight collision) is a typed
 * result the caller drives editor state from, NOT a thrown error; only a
 * transport fault, or the actor-token fail-safe (no identity bootstrapped —
 * `requireActorToken`), rejects. On a `saved` outcome the vault-mutation read
 * surfaces are invalidated so the next read returns the new blob, graph
 * generation, tree rows, git dirty/change state, and graph-derived projections.
 * The new `blob_hash` is echoed in the result for the caller to adopt as the next
 * optimistic-concurrency base.
 */
export function useSaveBody() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: SaveBodyArgs) => {
      const normalized = normalizeSaveBodyArgs(args);
      if (normalized.ref === null) {
        return refusedWriteResult("Missing document id");
      }
      const outcome = await authoringClient.directWrite(
        {
          operation: "replace_body",
          ref: normalized.ref,
          body: normalized.text,
          expected_blob_hash: normalized.baseBlobHash,
          scope: normalized.scope,
        },
        { actorToken: requireActorToken() },
      );
      return directWriteResultToOpsResult(outcome);
    },
    onSuccess: ({ result }, args) => {
      const normalized = normalizeSaveBodyArgs(args);
      if (result.kind === "saved") {
        invalidateAfterVaultMutation(queryClient, normalized.scope, normalized.nodeId);
      }
    },
  });
}

/** The arguments to a frontmatter write (`set-frontmatter`): the open doc + scope,
 *  plus the metadata fields to set. The body text is untouched. */
export interface SetFrontmatterArgs {
  nodeId: unknown;
  scope: unknown;
  date?: unknown;
  tags?: unknown;
  related?: unknown;
  baseBlobHash: unknown;
}

export interface NormalizedSetFrontmatterArgs {
  scope: string | null;
  nodeId: string | null;
  ref: string | null;
  date?: string;
  tags?: string[];
  related?: string[];
  baseBlobHash: string;
}

export function normalizeSetFrontmatterArgs(
  args: unknown,
): NormalizedSetFrontmatterArgs {
  const value = writeArgsRecord(args);
  const identity = normalizeWriteRef(value.nodeId);
  return {
    scope: normalizeGitDiffArg(value.scope),
    nodeId: identity.nodeId,
    ref: identity.ref,
    date: normalizeWriteOptionalString(value.date),
    tags: normalizeWriteStringList(value.tags),
    related: normalizeWriteStringList(value.related),
    baseBlobHash: normalizeWriteText(value.baseBlobHash),
  };
}

/**
 * Set the open document's frontmatter (date / tags / related) through the
 * authoring ledger's `directWrite` route (`operation: "edit_frontmatter"`,
 * ledgered-edit-migration W03.P07) — a self-approved direct changeset, not
 * the legacy `set-frontmatter` ops dispatch. Sends the open doc's `scope` as
 * the direct-write scope pin, same as `useSaveBody`. Same typed-result
 * discipline — a `conflict`/`refused` resolves (never throws); a frontmatter
 * validation refusal (or a denial, or an in-flight collision) arrives as a
 * `refused` carrying the served reason so the editor explains the rejection
 * without parsing prose; only a transport fault, or the actor-token fail-safe
 * (`requireActorToken`), rejects. Invalidates the shared vault-mutation read
 * surfaces on a successful save.
 */
export function useSetFrontmatter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: SetFrontmatterArgs) => {
      const normalized = normalizeSetFrontmatterArgs(args);
      if (normalized.ref === null) {
        return refusedWriteResult("Missing document id");
      }
      const outcome = await authoringClient.directWrite(
        {
          operation: "edit_frontmatter",
          ref: normalized.ref,
          frontmatter: {
            date: normalized.date,
            tags: normalized.tags,
            related: normalized.related,
          },
          expected_blob_hash: normalized.baseBlobHash,
          scope: normalized.scope,
        },
        { actorToken: requireActorToken() },
      );
      return directWriteResultToOpsResult(outcome);
    },
    onSuccess: ({ result }, args) => {
      const normalized = normalizeSetFrontmatterArgs(args);
      if (result.kind === "saved") {
        invalidateAfterVaultMutation(queryClient, normalized.scope, normalized.nodeId);
      }
    },
  });
}

/** The arguments to a document create (`create`): the scope it lands in, the doc
 *  type + feature (the only required fields), an optional title, and optional
 *  related stems. */
export interface CreateDocArgs {
  scope: unknown;
  docType: unknown;
  feature: unknown;
  title?: unknown;
  related?: unknown;
}

export interface NormalizedCreateDocArgs {
  scope: string | null;
  docType: string;
  feature: string;
  title?: string;
  related?: string[];
}

export function normalizeCreateDocArgs(args: unknown): NormalizedCreateDocArgs {
  const value = writeArgsRecord(args);
  return {
    scope: normalizeGitDiffArg(value.scope),
    docType: normalizeWriteOptionalString(value.docType) ?? "",
    feature: normalizeWriteOptionalString(value.feature) ?? "",
    title: normalizeWriteOptionalString(value.title),
    related: normalizeWriteStringList(value.related),
  };
}

/**
 * Create a new document through the authoring ledger's `directWrite` route
 * (`operation: "create_document"`, ledgered-edit-migration W03.P09) — a
 * self-approved direct changeset, not the legacy `create` ops dispatch. Sends
 * the target `scope` as the direct-write scope pin, same as Save/frontmatter/
 * rename. Resolves with `{ result, nodeId }` where `result` is the typed
 * `OpsWriteResult` and `nodeId` is the SERVER-echoed `doc:<stem>` id (W03.P09a
 * — `vault add` names the created file itself; the client never predicted a
 * stem, and now doesn't need to: the apply receipt echoes the real
 * `result_node_id`/`result_stem`/`document_path` for a landed create,
 * re-resolved server-side, never client-guessed). `conflict`/`refused`
 * (including a predicted-create-path collision, structurally tagged
 * `denialKind === "path_collision"` — W05.P14, never a reason-text substring
 * match) is a typed result the caller drives UI state from — NOT a thrown
 * error; only a transport fault, or the actor-token fail-safe
 * (`requireActorToken`), rejects. On a `created` outcome the same vault-
 * mutation read surfaces are invalidated as a save (a new doc can introduce
 * tree rows, graph nodes, filter facets, search hits, and git change
 * entries).
 */
export function useCreateDoc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      args: CreateDocArgs,
    ): Promise<{
      result: OpsWriteResult;
      tiers: TiersBlock;
      nodeId: string | null;
    }> => {
      const normalized = normalizeCreateDocArgs(args);
      if (normalized.docType.length === 0 || normalized.feature.length === 0) {
        return {
          ...refusedWriteResult("Document type and feature are required"),
          nodeId: null,
        };
      }
      const outcome = await authoringClient.directWrite(
        {
          operation: "create_document",
          create: {
            doc_type: normalized.docType,
            feature: normalized.feature,
            title: normalized.title ?? "",
            related: normalized.related,
          },
          scope: normalized.scope,
        },
        { actorToken: requireActorToken() },
      );
      if (outcome.kind === "applied") {
        // W03.P09a: the apply receipt now echoes the created document's real
        // identity (server-resolved, never client-predicted) —
        // `resultNodeId` is already the full `doc:<stem>` id.
        return {
          result: {
            kind: "created",
            path: outcome.documentPath ?? "",
            stem: outcome.resultStem ?? "",
          },
          tiers: outcome.tiers,
          nodeId: outcome.resultNodeId ?? null,
        };
      }
      if (outcome.kind === "conflict") {
        return {
          result: {
            kind: "conflict",
            expected: outcome.conflict.expected_blob_hash,
            actual: outcome.conflict.actual_blob_hash,
          },
          tiers: outcome.tiers,
          nodeId: null,
        };
      }
      // A predicted-create-path collision (`denialKind === "path_collision"`,
      // W05.P14) rides the same denied-status VALUE as every other denial and
      // folds into the SAME refused-with-checks result below: `OpsWriteResult`
      // (unlike rename's `RenameDocResult`) carries no distinct `collision`
      // kind for create, so there is no separate branch to route to.
      const reason =
        outcome.kind === "denied" || outcome.kind === "failed"
          ? (outcome.reason ?? "Create refused")
          : "a prior create for this document is still in flight — try again shortly";
      return {
        result: directWriteRefusedResult(reason),
        tiers: outcome.tiers,
        nodeId: null,
      };
    },
    onSuccess: ({ result }, args) => {
      const normalized = normalizeCreateDocArgs(args);
      if (result.kind === "created") {
        invalidateAfterVaultMutation(queryClient, normalized.scope);
      }
    },
  });
}

/** Args for {@link useRenameDoc}: the open document's node id, the new stem, and
 *  the optimistic-concurrency base. */
export interface RenameDocArgs {
  scope?: unknown;
  /** The current node id (`doc:<old-stem>`) being renamed. */
  nodeId: unknown;
  /** The new identity-bearing stem (filename without `.md`). */
  to: unknown;
  /** The pre-rename blob hash for optimistic concurrency. */
  expectedBlobHash?: unknown;
}

/** The typed outcome of a rename, branched on the rename envelope (NEVER the HTTP
 *  code): `renamed` carries the re-keyed `newNodeId` the caller retargets the open
 *  editor/tab to; the failure kinds drive the editor's reconcile/advisory UI
 *  without parsing prose. */
export type RenameDocResult =
  | {
      kind: "renamed";
      oldNodeId: string;
      newNodeId: string;
      newBlobHash: string;
      incomingRewritten: number;
    }
  | { kind: "conflict"; expected: string; actual: string }
  | { kind: "collision"; message: string }
  | { kind: "refused"; message: string; checks: unknown[] };

export interface NormalizedRenameDocArgs {
  scope: string | null;
  nodeId: string | null;
  ref: string | null;
  to: string;
  expectedBlobHash?: string;
}

export function normalizeRenameDocArgs(args: unknown): NormalizedRenameDocArgs {
  const value = writeArgsRecord(args);
  const identity = normalizeWriteRef(value.nodeId);
  return {
    scope: normalizeGitDiffArg(value.scope),
    nodeId: identity.nodeId,
    ref: identity.ref,
    to: normalizeWriteOptionalString(value.to) ?? "",
    expectedBlobHash: normalizeWriteOptionalString(value.expectedBlobHash),
  };
}

function refusedRenameResult(message: string): {
  result: RenameDocResult;
  tiers: TiersBlock;
} {
  return {
    result: { kind: "refused", message, checks: [] },
    tiers: {},
  };
}

/**
 * Rename a document's file through the authoring ledger's `directWrite` route
 * (`operation: "rename"`, ledgered-edit-migration W03.P08) — a self-approved
 * direct changeset, not the legacy `rename` ops dispatch. Sends the open doc's
 * `scope` as the direct-write scope pin, same as Save/frontmatter. On a
 * `renamed` outcome the caller re-keys the open editor/tab from `oldNodeId` to
 * `newNodeId` (the engine has already re-pointed incoming `related:` links,
 * and the watcher re-ingests) — `incomingRewritten` is not carried by the
 * direct-write outcome and floors to 0 (no consumer reads it today). A
 * `conflict` (a stale optimistic base) / `collision` (the target stem is
 * occupied, routed on the served structured `denialKind === "path_collision"`
 * — W05.P14, never a reason-text substring match) / `refused` (every other
 * denial/failure/in-flight collision) is a typed result the caller drives
 * editor state from — NOT a thrown error; only a transport fault, or the
 * actor-token fail-safe (`requireActorToken`), rejects. The same vault-
 * mutation read surfaces are invalidated as a save (a rename changes tree
 * rows, the content key, graph nodes, and git entries).
 */
export function useRenameDoc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      args: RenameDocArgs,
    ): Promise<{ result: RenameDocResult; tiers: TiersBlock }> => {
      const normalized = normalizeRenameDocArgs(args);
      if (normalized.ref === null || normalized.nodeId === null) {
        return refusedRenameResult("Missing document id");
      }
      if (normalized.to.length === 0) {
        return refusedRenameResult("Rename target is required");
      }
      // The direct-write route REQUIRES `expected_blob_hash` for rename (unlike
      // the legacy op, which tolerated an absent fence) — refuse client-side
      // rather than sending an empty string, which the backend 422s as a
      // malformed request rather than a graceful denial VALUE.
      if (!normalized.expectedBlobHash) {
        return refusedRenameResult("Missing the pre-rename optimistic base");
      }
      const outcome = await authoringClient.directWrite(
        {
          operation: "rename",
          ref: normalized.ref,
          new_stem: normalized.to,
          expected_blob_hash: normalized.expectedBlobHash,
          scope: normalized.scope,
        },
        { actorToken: requireActorToken() },
      );
      let result: RenameDocResult;
      if (outcome.kind === "applied") {
        result = {
          kind: "renamed",
          oldNodeId: normalized.nodeId,
          newNodeId: docNodeIdFromStem(normalized.to),
          newBlobHash: outcome.blobHash ?? "",
          incomingRewritten: 0,
        };
      } else if (outcome.kind === "conflict") {
        result = {
          kind: "conflict",
          expected: outcome.conflict.expected_blob_hash,
          actual: outcome.conflict.actual_blob_hash,
        };
      } else if (outcome.kind === "denied" && outcome.denialKind === "path_collision") {
        result = {
          kind: "collision",
          message: outcome.reason ?? "Target already exists",
        };
      } else {
        const reason =
          outcome.kind === "denied" || outcome.kind === "failed"
            ? (outcome.reason ?? "Rename refused")
            : "a prior rename for this document is still in flight — try again shortly";
        result = {
          kind: "refused",
          message: reason,
          checks: [{ severity: "error", message: reason, fixable: false }],
        };
      }
      return { result, tiers: outcome.tiers };
    },
    onSuccess: ({ result }, args) => {
      const normalized = normalizeRenameDocArgs(args);
      if (result.kind === "renamed") {
        invalidateAfterVaultMutation(queryClient, normalized.scope);
      }
    },
  });
}

// --- plan-step tick (authoring-surface ADR D1) -----------------------------------
//
// Ticking/unticking a plan Step rides the SAME ledgered `directWrite` route as
// every editor save, under the `set_plan_step_state` operation: the engine
// invokes `vault plan step check`/`uncheck` through the core adapter, fences the
// plan's optimistic base engine-side (the plan CLI carries no expected-blob-hash
// flag — authoring-surface ADR "Constraints"), and re-verifies the resulting Step
// state through the SAME parser the plan-interior projection serves from. The
// served `done` flag flips after the watcher re-ingests, so a successful tick
// invalidates the vault-mutation read surfaces — the plan-interior projection
// among them (`plan-interior` is a graph-generation subtree), which re-reads the
// flipped state. An idempotent re-tick (the Step already holds the desired state)
// reports success, never an error.

/** The typed outcome of a plan-step tick the status-rail checkbox drives its
 *  state from — NOT a thrown error. `ticked` carries the applied desired state and
 *  the plan's new blob hash (the next optimistic base); `conflict` is a stale base
 *  (the plan drifted since the row was read); `refused` is every denial/failure/
 *  in-flight collision, carrying the served reason. */
export type PlanStepTickResult =
  | { kind: "ticked"; done: boolean; blobHash: string | null }
  | { kind: "conflict"; expected: string; actual: string }
  | { kind: "refused"; reason: string };

/** Args for {@link usePlanStepTick}: the plan node id + scope, the canonical step
 *  id, the DESIRED closed state (`done`), and the plan's current blob hash (the
 *  engine-side stale-base fence). */
export interface PlanStepTickArgs {
  planNodeId: unknown;
  scope: unknown;
  stepId: unknown;
  /** The desired closed state: `true` ticks (check), `false` unticks (uncheck). */
  done: unknown;
  /** The plan document's current blob hash — the optimistic base the engine fences
   *  the tick against. */
  expectedBlobHash: unknown;
}

function refusedPlanStepResult(reason: string): {
  result: PlanStepTickResult;
  tiers: TiersBlock;
} {
  return { result: { kind: "refused", reason }, tiers: {} };
}

function planStepOutcomeToResult(
  outcome: DirectWriteOutcome,
  desiredDone: boolean,
): { result: PlanStepTickResult; tiers: TiersBlock } {
  if (outcome.kind === "applied") {
    return {
      result: { kind: "ticked", done: desiredDone, blobHash: outcome.blobHash },
      tiers: outcome.tiers,
    };
  }
  if (outcome.kind === "conflict") {
    return {
      result: {
        kind: "conflict",
        expected: outcome.conflict.expected_blob_hash,
        actual: outcome.conflict.actual_blob_hash,
      },
      tiers: outcome.tiers,
    };
  }
  const reason =
    outcome.kind === "denied" || outcome.kind === "failed"
      ? (outcome.reason ?? "The plan step could not be updated")
      : "a prior update for this plan step is still in flight — try again shortly";
  return { result: { kind: "refused", reason }, tiers: outcome.tiers };
}

/**
 * Tick or untick a plan Step through the authoring ledger's `directWrite` route
 * (`operation: "set_plan_step_state"`, authoring-surface ADR D1). Resolves with a
 * typed {@link PlanStepTickResult} — a `conflict` (a stale plan base) or a
 * `refused` (a denial, e.g. a non-human actor or a scope-pin mismatch; a failure;
 * or an in-flight collision) is a value the caller drives checkbox state from, NOT
 * a thrown error; only a transport fault, or the actor-token fail-safe
 * (`requireActorToken`), rejects. On a `ticked` outcome the vault-mutation read
 * surfaces are invalidated — including the plan-interior projection, which
 * re-reads the flipped `done` state after the watcher re-ingests.
 */
export function usePlanStepTick() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: PlanStepTickArgs) => {
      const scope = normalizeGitDiffArg(args.scope);
      const identity = normalizeWriteRef(args.planNodeId);
      const stepId = normalizeWriteText(args.stepId).trim();
      const expectedBlobHash = normalizeWriteText(args.expectedBlobHash);
      const done = args.done === true;
      if (identity.ref === null) return refusedPlanStepResult("Missing plan id");
      if (stepId.length === 0) return refusedPlanStepResult("Missing step id");
      if (expectedBlobHash.length === 0) {
        return refusedPlanStepResult("Missing the plan's optimistic base");
      }
      const outcome = await authoringClient.directWrite(
        {
          operation: "set_plan_step_state",
          ref: identity.ref,
          planStep: { stepId, state: done ? "checked" : "unchecked" },
          expected_blob_hash: expectedBlobHash,
          scope,
        },
        { actorToken: requireActorToken() },
      );
      return planStepOutcomeToResult(outcome, done);
    },
    onSuccess: ({ result }, args) => {
      if (result.kind === "ticked") {
        invalidateAfterVaultMutation(
          queryClient,
          normalizeGitDiffArg(args.scope),
          normalizeNodeId(args.planNodeId),
        );
      }
    },
  });
}
