// Bidirectional browser ↔ stage selection (W03.P09.S39, ADR G2.b).
//
// Selecting a document in the browser focuses its node on the stage, and
// selecting a node anywhere highlights its row in the browser — the same
// one shared selection, joined on the contract's stable id derivation
// (document node ids derive from the vault stem).

import type { VaultTreeEntry } from "../../stores/server/engine";
import { selectNode } from "../../stores/view/selection";
import { useViewStore } from "../../stores/view/viewStore";

/** Vault path → the contract's document node id (kind + canonical stem). */
export function pathToNodeId(path: string): string {
  const stem = path.replace(/^.*\//, "").replace(/\.md$/, "");
  return `doc:${stem}`;
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
