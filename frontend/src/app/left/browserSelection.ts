// Bidirectional browser ↔ stage selection (W03.P09.S39, ADR G2.b).
//
// Selecting a document in the browser focuses its node on the stage, and
// selecting a node anywhere highlights its row in the browser — the same
// one shared selection, joined on the contract's stable id derivation
// (document node ids derive from the vault stem).

import type { FileTreeEntry, VaultTreeEntry } from "../../stores/server/engine";
import {
  codeNodeIdFromPath,
  docNodeIdFromStem,
  stemFromPath,
} from "../../stores/server/liveAdapters";
import { useDashboardSelectedNodeId } from "../../stores/view/selection";
import { openDocTab, previewDocTab } from "../../stores/view/tabs";

export {
  useScopeContextSelection,
  useSelectFolderContext,
} from "../../stores/server/sessionContext";

/** Vault path → its canonical stem, through the stores-owned identity grammar. */
export function pathStem(path: string): string {
  return stemFromPath(path);
}

/** Vault path → the contract's document node id (kind + canonical stem). */
export function pathToNodeId(path: string): string {
  return docNodeIdFromStem(pathStem(path));
}

/** Document node id → the vault path's stem (for row matching). */
export function nodeIdToStem(id: string): string | null {
  return id.startsWith("doc:") ? id.slice(4) : null;
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
  scope: string | null = null,
): string | null {
  const selectedId = useDashboardSelectedNodeId(scope);
  return highlightedPathFor(entries, selectedId);
}

// --- code-tree row ↔ stage selection (dashboard-code-tree ADR "The interlink") ---
//
// The code browser realizes the SAME bidirectional join the vault browser does
// for `doc:<stem>`, now for `code:<path>`: selecting a file row focuses its
// `code:` node on the stage, and the active stage selection highlights the
// matching row. The join is on the contract's stable id derivation — a file path
// maps to `code:<path>` by the shared `node_id` rule the listing already applied
// (the entry carries `node_id`), so no new identity scheme. A file with no
// `code:` node in the current graph is still listed and selectable for
// navigation; its interlink is a quiet ABSENT state, never an error — but the
// selection still fires (it focuses the id even when no node is mounted yet).

/** Code file path → the contract's code-artifact node id (kind + repo-relative
 *  path). The same `code:<path>` derivation the listing endpoint applies, so the
 *  derivation lives in ONE place conceptually; the entry carries the id directly. */
export function codePathToNodeId(path: string): string {
  return codeNodeIdFromPath(path);
}

/** Code-artifact node id → the repo-relative path (for row matching). */
export function nodeIdToCodePath(id: string): string | null {
  return id.startsWith("code:") ? id.slice(5) : null;
}

export function useDashboardBrowserSelection(scope: string | null): {
  handleEntryClick: (entry: VaultTreeEntry) => void;
  handleEntryOpen: (entry: VaultTreeEntry) => void;
  handleCodeEntryClick: (entry: FileTreeEntry) => void;
  handleCodeEntryOpen: (entry: FileTreeEntry) => void;
} {
  return {
    // VS Code semantics (editor-dock-workspace): a single click PREVIEWS the
    // document in the single provisional tab (which the next preview replaces in
    // place); an open (double-click / Enter) makes it a PERMANENT tab. Both also
    // focus the node on the graph (the tab seam selects).
    handleEntryClick: (entry) => {
      void previewDocTab(pathToNodeId(entry.path), "markdown", scope).catch(
        () => undefined,
      );
    },
    handleEntryOpen: (entry) => {
      void openDocTab(pathToNodeId(entry.path), "markdown", scope).catch(
        () => undefined,
      );
    },
    handleCodeEntryClick: (entry) => {
      const id = entry.node_id || codePathToNodeId(entry.path);
      void previewDocTab(id, "code", scope).catch(() => undefined);
    },
    handleCodeEntryOpen: (entry) => {
      const id = entry.node_id || codePathToNodeId(entry.path);
      void openDocTab(id, "code", scope).catch(() => undefined);
    },
  };
}

/**
 * The code-tree row to highlight for the current selection, if the selected
 * entity is a `code:` artifact whose path is present in the given (visible,
 * already-fetched) level. Mirrors `highlightedPathFor` for the `doc:` join. The
 * match is on the entry's `node_id` (the shared-rule id) so it is robust to path
 * normalization differences.
 */
export function highlightedCodePathFor(
  entries: readonly FileTreeEntry[] | undefined,
  selectedId: string | null,
): string | null {
  if (!selectedId || !entries) return null;
  if (!selectedId.startsWith("code:")) return null;
  const match = entries.find((e) => e.node_id === selectedId);
  return match?.path ?? null;
}

/** Hook: the highlighted code-tree path for the shared selection, over the
 *  visible (already-fetched) level entries. */
export function useHighlightedCodePath(
  entries: readonly FileTreeEntry[] | undefined,
  scope: string | null = null,
): string | null {
  const selectedId = useDashboardSelectedNodeId(scope);
  return highlightedCodePathFor(entries, selectedId);
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
