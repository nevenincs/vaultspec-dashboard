// The entity descriptor union (dashboard-context-menus ADR, layer 3): the
// per-surface "information context" the brief asks to standardise, reduced to
// one shape. Every right-clickable thing in the dashboard is one of these
// `{ kind, id, …fields }` descriptors, which each surface already holds at event
// time. The menu contents are a pure function of the descriptor (plus app
// state) - that function is the resolver, registered by `kind` in `./registry`.
//
// Substrate module: no imports from app/, scene/, or stores. Fields are the
// minimum a resolver needs; surfaces fill them at the event site.

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
  path: string;
  stem: string;
  /** The linked graph node id, when this document resolves to one. */
  nodeId?: string;
}

/** Left rail: a code file or directory row in the tree. */
export interface CodeFileEntity {
  kind: "code-file";
  id: string;
  path: string;
  isDir: boolean;
  nodeId?: string;
}

/** Right rail / graph: a graph node (inspector subject or stage node). */
export interface NodeEntity {
  kind: "node";
  id: string;
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
  nodeIds: string[];
  ts?: number;
  truncatedNodeIds?: number;
}

/** Right rail: a semantic search result row. */
export interface SearchResultEntity {
  kind: "search-result";
  id: string;
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
}

/** Graph: empty canvas (no entity under the pointer). */
export interface CanvasEntity {
  kind: "canvas";
  /** A stable sentinel id so the menu slice/key handling is uniform. */
  id: "canvas";
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
  | MetaEdgeEntity
  | IslandEntity
  | CanvasEntity;

/** The entity `kind` discriminant - the registry key. */
export type EntityKind = EntityDescriptor["kind"];
