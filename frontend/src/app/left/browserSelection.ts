// Bidirectional browser ↔ stage selection (W03.P09.S39, ADR G2.b).
//
// Selecting a document in the browser focuses its node on the stage, and
// selecting a node anywhere highlights its row in the browser — the same
// one shared selection, joined on the contract's stable id derivation
// (document node ids derive from the vault stem).

import { usePutSession } from "../../stores/server/queries";
import type { VaultTreeEntry } from "../../stores/server/engine";
import { selectNode } from "../../stores/view/selection";
import { useViewStore } from "../../stores/view/viewStore";

/** The single stem derivation every surface shares (finding 024). */
export function pathStem(path: string): string {
  return path.replace(/^.*\//, "").replace(/\.md$/, "");
}

/** Vault path → the contract's document node id (kind + canonical stem). */
export function pathToNodeId(path: string): string {
  return `doc:${pathStem(path)}`;
}

/** Document node id → the vault path's stem (for row matching). */
export function nodeIdToStem(id: string): string | null {
  return id.startsWith("doc:") ? id.slice(4) : null;
}

/** Browser row click → the shared selection (stage focuses via S23). */
export function handleEntryClick(entry: VaultTreeEntry): void {
  selectNode(pathToNodeId(entry.path));
}

/**
 * The browser row to highlight for the current selection, if the selected
 * entity is a document with a row in the given tree.
 */
export function highlightedPathFor(
  entries: readonly VaultTreeEntry[] | undefined,
  selectedId: string | null,
): string | null {
  if (!selectedId || !entries) return null;
  const stem = nodeIdToStem(selectedId);
  if (!stem) return null;
  return entries.find((e) => e.path.endsWith(`/${stem}.md`))?.path ?? null;
}

/** Hook: the highlighted browser path for the shared selection. */
export function useHighlightedPath(
  entries: readonly VaultTreeEntry[] | undefined,
): string | null {
  const selectedId = useViewStore((s) => s.selectedId);
  return highlightedPathFor(entries, selectedId);
}

// --- current folder + feature-tag contexts (user-state-persistence W04.P09.S32) --
//
// "Current folder + contexts" is a PROJECTION over the existing `feature_tags`
// grouping primitive and the `/vault-tree` subtree — never a new node model
// (views-are-projections-of-one-model). The active folder is a `.vault/` subtree
// group (the vault browser's doc-type sections); its contexts are the feature
// tags of the documents in that folder. The durable home is the session API
// (`scope_context`), mirrored into the view store for synchronous reads.

/**
 * The distinct feature-tag contexts present in a folder (a `.vault/` doc-type
 * group), in stable first-seen order — the projection over the entries'
 * `feature_tags`. With no folder argument, the contexts span the whole tree. A
 * pure derivation (unit-tested), not a fetch.
 */
export function featureContextsFor(
  entries: readonly VaultTreeEntry[] | undefined,
  folder: string | null,
): string[] {
  if (!entries) return [];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const entry of entries) {
    if (folder !== null && entry.doc_type !== folder) continue;
    for (const tag of entry.feature_tags) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      ordered.push(tag);
    }
  }
  return ordered;
}

/** The current folder + feature-tag contexts, read from the view store (the
 *  projection mirrored from the restored session). A pure read — no fetch. */
export function useScopeContextSelection(): {
  folder: string | null;
  featureContexts: string[];
} {
  const folder = useViewStore((s) => s.activeFolder);
  const featureContexts = useViewStore((s) => s.featureContexts);
  return { folder, featureContexts };
}

/**
 * Select the current folder + its feature-tag contexts: mirror the choice into
 * the view store for synchronous reads AND persist it durably through the session
 * API (`PUT /session scope_context`), scoped to the active worktree. The durable
 * home is the session, never localStorage. Returns the mutation so callers can
 * surface a rejected persist.
 */
export function useSelectFolderContext() {
  const setScopeContext = useViewStore((s) => s.setScopeContext);
  const putSession = usePutSession();
  const select = (folder: string | null, featureTags: string[]) => {
    setScopeContext({ folder, featureTags });
    putSession.mutate({
      scope_context: { folder, feature_tags: featureTags },
    });
  };
  return { select, putSession };
}
