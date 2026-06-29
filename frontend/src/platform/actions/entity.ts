// The entity descriptor union (dashboard-context-menus ADR, layer 3): the
// per-surface "information context" the brief asks to standardise, reduced to
// one shape. Every right-clickable thing in the dashboard is one of these
// `{ kind, id, …fields }` descriptors, which each surface already holds at event
// time. The menu contents are a pure function of the descriptor (plus app
// state) - that function is the resolver, registered by `kind` in `./registry`.
//
// Substrate module: no imports from app/, scene/, or stores. Fields are the
// minimum a resolver needs; surfaces fill them at the event site.

import { normalizeNodeId, normalizeNodeIds } from "../graph/nodeIds";
import { normalizeOptionalNullableScopeId } from "../scope/scopeIdentity";

/** Left rail: a project root in the workspace registry. */
export interface WorkspaceEntity {
  kind: "workspace";
  id: string;
  path?: string;
  isLaunchDefault?: boolean;
}

/** Left rail: a corpus-bearing worktree (repo/branch/scope). */
export interface WorktreeEntity {
  kind: "worktree";
  id: string;
  branch?: string;
  path?: string;
  hasVault?: boolean;
}

/** Left rail: a vault document row in the browser. */
export interface VaultDocEntity {
  kind: "vault-doc";
  id: string;
  /** The active dashboard scope at the surface that published this entity. */
  scope?: string | null;
  path: string;
  stem: string;
  /** The linked graph node id, when this document resolves to one. */
  nodeId?: string;
}

/** Left rail: a code file or directory row in the tree. */
export interface CodeFileEntity {
  kind: "code-file";
  id: string;
  /** The active dashboard scope at the surface that published this entity. */
  scope?: string | null;
  path: string;
  isDir: boolean;
  nodeId?: string;
}

/** Right rail / graph: a graph node (inspector subject or stage node). */
export interface NodeEntity {
  kind: "node";
  id: string;
  /** The active dashboard scope at the surface that published this entity. */
  scope?: string | null;
  title?: string;
  /** Stage-origin nodes know their open/pin/working-set membership. */
  isOpen?: boolean;
  isPinned?: boolean;
  inWorkingSet?: boolean;
}

/** Right rail / graph: a single provenance edge. */
export interface EdgeEntity {
  kind: "edge";
  id: string;
  relation?: string;
  dst?: string;
  tier?: string;
}

/** Right rail / timeline: a timeline event (carries its touched node ids). */
export interface EventEntity {
  kind: "event";
  id: string;
  /** The active dashboard scope at the surface that published this entity. */
  scope?: string | null;
  nodeIds: string[];
  ts?: number;
  truncatedNodeIds?: number;
}

/** Right rail: a semantic search result row. */
export interface SearchResultEntity {
  kind: "search-result";
  id: string;
  /** The active dashboard scope at the surface that published this entity. */
  scope?: string | null;
  source: string;
  nodeId?: string;
  score?: number;
  isCode?: boolean;
}

/** Right rail: a changed file or a diff hunk. */
export interface ChangeEntity {
  kind: "change";
  id: string;
  path: string;
  /** Present when the descriptor is a hunk rather than the whole file. */
  hunk?: string;
}

/** Right rail: a recent commit row (read-only history). The `id` is the full
 *  commit hash; the short hash and subject are carried for the copy verbs. */
export interface CommitEntity {
  kind: "commit";
  id: string;
  shortHash?: string;
  subject?: string;
}

/** Right rail: a pull-request row (id = the PR number as a string). Carries the PR
 *  title and the remote url so the menu can open it. */
export interface PullRequestEntity {
  kind: "pull-request";
  id: string;
  title?: string;
  url?: string;
}

/** Graph: an aggregated meta-edge (feature-to-feature ribbon). */
export interface MetaEdgeEntity {
  kind: "meta-edge";
  id: string;
  src?: string;
  dst?: string;
  tier?: string;
  summary?: string;
}

/** Graph: an opened node's DOM island interior. */
export interface IslandEntity {
  kind: "island";
  id: string;
  /** The active dashboard scope at the surface that published this entity. */
  scope?: string | null;
}

/** Graph: empty canvas (no entity under the pointer). */
export interface CanvasEntity {
  kind: "canvas";
  /** A stable sentinel id so the menu slice/key handling is uniform. */
  id: "canvas";
}

/** Chrome: empty rail/timeline background (no row/mark under the pointer). The
 *  background context menu carries the app-chrome escape hatches; `region` records
 *  which surface published it (carried for future region-specific verbs + labels). */
export type BackgroundRegion = "left-rail" | "right-rail" | "timeline";
export interface BackgroundEntity {
  kind: "background";
  id: string;
  region?: BackgroundRegion;
}

/** Dock: an open DOCUMENT TAB header (#15). The id IS the document node id; the
 *  target-relative tab verbs (keep-open / reload / close / close-others / close-all)
 *  resolve off it. */
export interface DocTabEntity {
  kind: "doc-tab";
  id: string;
  /** The document node id (equals `id`; carried explicitly for parity with other
   *  node-bearing entities). */
  nodeId?: string;
  /** The active dashboard scope at the surface that published this entity. */
  scope?: string | null;
}

/** Every right-clickable entity across the four regions. */
export type EntityDescriptor =
  | WorkspaceEntity
  | WorktreeEntity
  | VaultDocEntity
  | CodeFileEntity
  | NodeEntity
  | EdgeEntity
  | EventEntity
  | SearchResultEntity
  | ChangeEntity
  | CommitEntity
  | PullRequestEntity
  | MetaEdgeEntity
  | IslandEntity
  | CanvasEntity
  | BackgroundEntity
  | DocTabEntity;

/** The entity `kind` discriminant - the registry key. */
export type EntityKind = EntityDescriptor["kind"];

export const ENTITY_KINDS: readonly EntityKind[] = [
  "workspace",
  "worktree",
  "vault-doc",
  "code-file",
  "node",
  "edge",
  "event",
  "search-result",
  "change",
  "commit",
  "pull-request",
  "meta-edge",
  "island",
  "canvas",
  "background",
  "doc-tab",
];

const ENTITY_KIND_SET = new Set<string>(ENTITY_KINDS);
const BACKGROUND_REGIONS = new Set<string>(["left-rail", "right-rail", "timeline"]);
export const ENTITY_DESCRIPTOR_ID_MAX_CHARS = 2048;
export const ENTITY_DESCRIPTOR_PATH_MAX_CHARS = 2048;
export const ENTITY_DESCRIPTOR_TEXT_MAX_CHARS = 512;
export const ENTITY_DESCRIPTOR_HUNK_MAX_CHARS = 64 * 1024;

function isEntityRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeRequiredString(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxChars ? normalized : null;
}

function normalizeOptionalString(value: unknown, maxChars: number): string | undefined {
  const normalized = normalizeRequiredString(value, maxChars);
  return normalized ?? undefined;
}

function normalizeRequiredEntityId(value: unknown): string | null {
  return normalizeRequiredString(value, ENTITY_DESCRIPTOR_ID_MAX_CHARS);
}

function normalizeRequiredPath(value: unknown): string | null {
  return normalizeRequiredString(value, ENTITY_DESCRIPTOR_PATH_MAX_CHARS);
}

function normalizeOptionalPath(value: unknown): string | undefined {
  return normalizeOptionalString(value, ENTITY_DESCRIPTOR_PATH_MAX_CHARS);
}

function normalizeRequiredText(value: unknown): string | null {
  return normalizeRequiredString(value, ENTITY_DESCRIPTOR_TEXT_MAX_CHARS);
}

function normalizeOptionalText(value: unknown): string | undefined {
  return normalizeOptionalString(value, ENTITY_DESCRIPTOR_TEXT_MAX_CHARS);
}

function normalizeOptionalHunk(value: unknown): string | undefined {
  return normalizeOptionalString(value, ENTITY_DESCRIPTOR_HUNK_MAX_CHARS);
}

function normalizeOptionalNodeId(value: unknown): string | undefined {
  return normalizeNodeId(value) ?? undefined;
}

function normalizeOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeOptionalCount(value: unknown): number | undefined {
  const normalized = normalizeOptionalNumber(value);
  return normalized === undefined || normalized < 0
    ? undefined
    : Math.trunc(normalized);
}

function normalizeNodeIdList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return normalizeNodeIds(value, value.length);
}

function assignDefined<T extends object, K extends string, V>(
  target: T,
  key: K,
  value: V | undefined,
): T & Partial<Record<K, V>> {
  if (value !== undefined) {
    Object.assign(target, { [key]: value });
  }
  return target;
}

export function normalizeEntityKind(kind: unknown): EntityKind | null {
  if (typeof kind !== "string") return null;
  const normalized = kind.trim();
  return ENTITY_KIND_SET.has(normalized) ? (normalized as EntityKind) : null;
}

export function normalizeEntityDescriptor(entity: unknown): EntityDescriptor | null {
  if (!isEntityRecord(entity)) return null;
  const kind = normalizeEntityKind(entity.kind);
  if (kind === null) return null;
  if (kind === "canvas") return { kind, id: "canvas" };

  const id = normalizeRequiredEntityId(entity.id);
  if (id === null) return null;

  switch (kind) {
    case "workspace": {
      const normalized: WorkspaceEntity = { kind, id };
      assignDefined(normalized, "path", normalizeOptionalPath(entity.path));
      assignDefined(
        normalized,
        "isLaunchDefault",
        normalizeOptionalBoolean(entity.isLaunchDefault),
      );
      return normalized;
    }
    case "worktree": {
      const normalized: WorktreeEntity = { kind, id };
      assignDefined(normalized, "branch", normalizeOptionalText(entity.branch));
      assignDefined(normalized, "path", normalizeOptionalPath(entity.path));
      assignDefined(normalized, "hasVault", normalizeOptionalBoolean(entity.hasVault));
      return normalized;
    }
    case "vault-doc": {
      const path = normalizeRequiredPath(entity.path);
      const stem = normalizeRequiredText(entity.stem);
      if (path === null || stem === null) return null;
      const normalized: VaultDocEntity = { kind, id, path, stem };
      assignDefined(
        normalized,
        "scope",
        normalizeOptionalNullableScopeId(entity.scope),
      );
      assignDefined(normalized, "nodeId", normalizeOptionalNodeId(entity.nodeId));
      return normalized;
    }
    case "code-file": {
      const path = normalizeRequiredPath(entity.path);
      if (path === null || typeof entity.isDir !== "boolean") return null;
      const normalized: CodeFileEntity = { kind, id, path, isDir: entity.isDir };
      assignDefined(
        normalized,
        "scope",
        normalizeOptionalNullableScopeId(entity.scope),
      );
      assignDefined(normalized, "nodeId", normalizeOptionalNodeId(entity.nodeId));
      return normalized;
    }
    case "node": {
      const nodeId = normalizeNodeId(entity.id);
      if (nodeId === null) return null;
      const normalized: NodeEntity = { kind, id: nodeId };
      assignDefined(
        normalized,
        "scope",
        normalizeOptionalNullableScopeId(entity.scope),
      );
      assignDefined(normalized, "title", normalizeOptionalText(entity.title));
      assignDefined(normalized, "isOpen", normalizeOptionalBoolean(entity.isOpen));
      assignDefined(normalized, "isPinned", normalizeOptionalBoolean(entity.isPinned));
      assignDefined(
        normalized,
        "inWorkingSet",
        normalizeOptionalBoolean(entity.inWorkingSet),
      );
      return normalized;
    }
    case "edge": {
      const normalized: EdgeEntity = { kind, id };
      assignDefined(normalized, "relation", normalizeOptionalText(entity.relation));
      assignDefined(normalized, "dst", normalizeOptionalNodeId(entity.dst));
      assignDefined(normalized, "tier", normalizeOptionalText(entity.tier));
      return normalized;
    }
    case "event": {
      const nodeIds = normalizeNodeIdList(entity.nodeIds);
      if (nodeIds === null) return null;
      const normalized: EventEntity = { kind, id, nodeIds };
      assignDefined(
        normalized,
        "scope",
        normalizeOptionalNullableScopeId(entity.scope),
      );
      assignDefined(normalized, "ts", normalizeOptionalNumber(entity.ts));
      assignDefined(
        normalized,
        "truncatedNodeIds",
        normalizeOptionalCount(entity.truncatedNodeIds),
      );
      return normalized;
    }
    case "search-result": {
      const source = normalizeRequiredText(entity.source);
      if (source === null) return null;
      const normalized: SearchResultEntity = { kind, id, source };
      assignDefined(
        normalized,
        "scope",
        normalizeOptionalNullableScopeId(entity.scope),
      );
      assignDefined(normalized, "nodeId", normalizeOptionalNodeId(entity.nodeId));
      assignDefined(normalized, "score", normalizeOptionalNumber(entity.score));
      assignDefined(normalized, "isCode", normalizeOptionalBoolean(entity.isCode));
      return normalized;
    }
    case "change": {
      const path = normalizeRequiredPath(entity.path);
      if (path === null) return null;
      const normalized: ChangeEntity = { kind, id, path };
      assignDefined(normalized, "hunk", normalizeOptionalHunk(entity.hunk));
      return normalized;
    }
    case "commit": {
      const normalized: CommitEntity = { kind, id };
      assignDefined(normalized, "shortHash", normalizeOptionalText(entity.shortHash));
      assignDefined(normalized, "subject", normalizeOptionalText(entity.subject));
      return normalized;
    }
    case "pull-request": {
      const normalized: PullRequestEntity = { kind, id };
      assignDefined(normalized, "title", normalizeOptionalText(entity.title));
      assignDefined(normalized, "url", normalizeOptionalText(entity.url));
      return normalized;
    }
    case "meta-edge": {
      const normalized: MetaEdgeEntity = { kind, id };
      assignDefined(normalized, "src", normalizeOptionalNodeId(entity.src));
      assignDefined(normalized, "dst", normalizeOptionalNodeId(entity.dst));
      assignDefined(normalized, "tier", normalizeOptionalText(entity.tier));
      assignDefined(normalized, "summary", normalizeOptionalText(entity.summary));
      return normalized;
    }
    case "island": {
      const normalized: IslandEntity = { kind, id };
      assignDefined(
        normalized,
        "scope",
        normalizeOptionalNullableScopeId(entity.scope),
      );
      return normalized;
    }
    case "doc-tab": {
      const normalized: DocTabEntity = { kind, id };
      assignDefined(normalized, "nodeId", normalizeOptionalNodeId(entity.nodeId));
      assignDefined(
        normalized,
        "scope",
        normalizeOptionalNullableScopeId(entity.scope),
      );
      return normalized;
    }
    case "background": {
      const normalized: BackgroundEntity = { kind, id };
      const region = typeof entity.region === "string" ? entity.region.trim() : "";
      if (BACKGROUND_REGIONS.has(region)) {
        normalized.region = region as BackgroundRegion;
      }
      return normalized;
    }
  }
}
