// The vault-scoped file browser (W03.P09.S38, ADR G2.c): a read-only tree
// over the vault corpus only, grouped by the `.vault/` subtree (research /
// adr / plan / exec / audit / reference / index), each entry showing a
// doc-type glyph, feature tag, and freshness. The boring, reliable entry
// path for users who think in files; selection wiring is S39's.

import { useState } from "react";

import type { VaultTreeEntry } from "../../stores/server/engine";
import { useVaultTree } from "../../stores/server/queries";
import { useActiveScope } from "../stage/Stage";
import { handleEntryClick, pathStem, useHighlightedPath } from "./browserSelection";

// --- pure helpers (unit-tested) ---------------------------------------------------

/** Canonical `.vault/` group order; unknown groups append alphabetically. */
export const VAULT_GROUPS = [
  "research",
  "adr",
  "plan",
  "exec",
  "audit",
  "reference",
  "index",
] as const;

export function groupEntries(
  entries: readonly VaultTreeEntry[],
): Map<string, VaultTreeEntry[]> {
  const groups = new Map<string, VaultTreeEntry[]>();
  const order: string[] = [...VAULT_GROUPS];
  for (const extra of [...new Set(entries.map((e) => e.doc_type))].sort()) {
    if (!order.includes(extra)) order.push(extra);
  }
  for (const group of order) {
    const members = entries
      .filter((e) => e.doc_type === group)
      .sort((a, b) => a.path.localeCompare(b.path));
    if (members.length > 0) groups.set(group, members);
  }
  return groups;
}

const DOC_GLYPHS: Record<string, string> = {
  research: "✎",
  adr: "◆",
  plan: "▤",
  exec: "▲",
  audit: "▣",
  reference: "❡",
  index: "☰",
};

export function docGlyph(docType: string): string {
  return DOC_GLYPHS[docType] ?? "○";
}

/** Compact freshness label: <1h "now", then h/d/w buckets; cooled = "". */
export function freshnessLabel(modified: string | undefined, now: number): string {
  if (!modified) return "";
  const at = Date.parse(modified);
  if (!Number.isFinite(at)) return "";
  const age = now - at;
  if (age < 3600_000) return "now";
  if (age < 24 * 3600_000) return `${Math.floor(age / 3600_000)}h`;
  if (age < 7 * 24 * 3600_000) return `${Math.floor(age / (24 * 3600_000))}d`;
  if (age < 30 * 24 * 3600_000) return `${Math.floor(age / (7 * 24 * 3600_000))}w`;
  return "";
}

/** Display stem — the shared derivation from the selection join (024). */
export function entryStem(path: string): string {
  return pathStem(path);
}

export interface VaultBrowserProps {
  /** Row click handler (S39 wires bidirectional selection). */
  onEntryClick?: (entry: VaultTreeEntry) => void;
  /** The entry currently highlighted by the shared selection (S39). */
  highlightedPath?: string | null;
}

export function VaultBrowser({ onEntryClick, highlightedPath }: VaultBrowserProps) {
  const scope = useActiveScope();
  const tree = useVaultTree(scope);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Bidirectional selection by default (S39): clicks select, selections
  // highlight; explicit props override for embedding contexts.
  const sharedHighlight = useHighlightedPath(tree.data?.entries);
  const clickHandler = onEntryClick ?? handleEntryClick;
  const highlight = highlightedPath ?? sharedHighlight;

  if (tree.isPending) return <p className="text-xs text-stone-400">reading vault…</p>;
  if (tree.isError) {
    return <p className="text-xs text-amber-700">vault tree unavailable</p>;
  }

  const groups = groupEntries(tree.data?.entries ?? []);
  const now = Date.now();

  return (
    <nav className="text-xs" aria-label="vault browser" data-vault-browser>
      {[...groups.entries()].map(([group, entries]) => {
        const isCollapsed = collapsed.has(group);
        return (
          <section key={group} className="mt-1">
            <button
              type="button"
              aria-expanded={!isCollapsed}
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(group)) next.delete(group);
                  else next.add(group);
                  return next;
                })
              }
              className="flex w-full items-center gap-1 font-medium text-stone-500"
            >
              <span>{isCollapsed ? "▸" : "▾"}</span>
              {group}
              <span className="text-stone-300">{entries.length}</span>
            </button>
            {!isCollapsed && (
              <ul className="mt-0.5 ml-3 space-y-0.5">
                {entries.map((entry) => {
                  const fresh = freshnessLabel(entry.dates.modified, now);
                  const highlighted = entry.path === highlight;
                  return (
                    <li key={entry.path}>
                      <button
                        type="button"
                        title={entry.path}
                        onClick={() => clickHandler(entry)}
                        className={`flex w-full items-center gap-1 truncate rounded px-1 text-left ${
                          highlighted
                            ? "bg-stone-200 text-stone-900"
                            : "text-stone-600 hover:bg-stone-50"
                        }`}
                      >
                        <span className="text-stone-400">
                          {docGlyph(entry.doc_type)}
                        </span>
                        <span className="truncate">{entryStem(entry.path)}</span>
                        {entry.feature_tags[0] && (
                          <span className="text-stone-300">
                            #{entry.feature_tags[0]}
                          </span>
                        )}
                        {fresh && (
                          <span className="ml-auto text-emerald-600">{fresh}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </nav>
  );
}
