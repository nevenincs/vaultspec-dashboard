// The vault-scoped file browser (W03.P09.S38, re-skinned W02.P05.S21 onto the
// OKLCH token layer and the sanctioned icon families per the sidebar surface
// ADR): a read-only tree over the vault corpus only, grouped by the `.vault/`
// subtree (research / adr / plan / exec / audit / reference / index), each entry
// showing a Phosphor doc-type mark, the stem as path identity, the first feature
// tag, and a freshness label. The boring, reliable, keyboard-first entry path
// for users who think in files; it consumes the corpus only through the stores'
// `/vault-tree` query hook, reads degradation only through a stores selector
// (never the raw `tiers` block), and joins selection on the contract's stable
// document node id. It fetches nothing and defines no model — chrome over the
// one projection.

import {
  BookOpen,
  ClipboardText,
  Diamond,
  FileDashed,
  type Icon,
  ListBullets,
  Pencil,
  SealCheck,
  Stack,
} from "@phosphor-icons/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useRef, useState } from "react";

import type { VaultDocEntity } from "../../platform/actions/entity";
import type { VaultTreeEntry } from "../../stores/server/engine";
import { useVaultTree, useVaultTreeAvailability } from "../../stores/server/queries";
import { openContextMenu } from "../../stores/view/contextMenu";
import { useActiveScope } from "../stage/Stage";
import {
  handleEntryClick,
  pathStem,
  pathToNodeId,
  useHighlightedPath,
} from "./browserSelection";
// Self-registering left-rail context-menu resolver (W03.P07): importing the
// module runs its `registerResolver("vault-doc", …)` side effect once.
import "./menus/vaultDocMenu";

/** Build the vault-doc context-menu entity from a browser row's data. */
function vaultDocEntity(entry: VaultTreeEntry): VaultDocEntity {
  const nodeId = pathToNodeId(entry.path);
  return {
    kind: "vault-doc",
    id: nodeId,
    path: entry.path,
    stem: pathStem(entry.path),
    nodeId,
  };
}

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

// Doc-type marks (sidebar ADR / iconography ADR): one Phosphor mark per doc type,
// each grayscale-distinct by SHAPE at 14px (pencil / diamond / clipboard /
// stacked layers / sealed check / open book / list lines), with a dashed-file
// fallback. They read in `currentColor` and inherit the rail's dimmed ink, so
// hue is never the identity channel — this retires the legacy Unicode glyph map.
const DOC_MARKS: Record<string, Icon> = {
  research: Pencil,
  adr: Diamond,
  plan: ClipboardText,
  exec: Stack,
  audit: SealCheck,
  reference: BookOpen,
  index: ListBullets,
};

export function docMark(docType: string): Icon {
  return DOC_MARKS[docType] ?? FileDashed;
}

/**
 * The set of doc types with a distinct mark — exported so the unit test can
 * assert grayscale-by-shape distinctness without rendering React.
 */
export function docMarkName(docType: string): string {
  const mark = docMark(docType);
  return mark.displayName ?? mark.name ?? "FileDashed";
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

/** True only for genuinely fresh items (<1h) — the accent tints these alone. */
export function isFresh(label: string): boolean {
  return label === "now";
}

/** Display stem — the shared derivation from the selection join (024). */
export function entryStem(path: string): string {
  return pathStem(path);
}

// --- icon sizing (token-aligned, not arbitrary px) -------------------------------
// 14px is the iconography ADR's grayscale-by-shape gate size; the disclosure
// chevrons read one density step smaller so the structural chrome stays
// attenuated relative to the doc-type marks.
const DOC_MARK_PX = 14;
const CHEVRON_PX = 12;

/**
 * Client-side narrowing of the ALREADY-FETCHED vault listing (dashboard-left-
 * rail ADR "In-rail filter"): a row matches when its stem, full path, or any
 * feature tag contains the (lowercased) query. It issues NO wire request — it
 * filters the entries the `/vault-tree` query already returned, the deliberate
 * counterpart to the global right-rail search pillar. Empty/absent shows all.
 * Pure (unit-tested), not a fetch.
 */
export function filterVaultEntries(
  entries: readonly VaultTreeEntry[],
  filter: string,
): VaultTreeEntry[] {
  const q = filter.trim().toLowerCase();
  if (q.length === 0) return [...entries];
  return entries.filter(
    (e) =>
      entryStem(e.path).toLowerCase().includes(q) ||
      e.path.toLowerCase().includes(q) ||
      e.feature_tags.some((t) => t.toLowerCase().includes(q)),
  );
}

export interface VaultBrowserProps {
  /** Row click handler (S39 wires bidirectional selection). */
  onEntryClick?: (entry: VaultTreeEntry) => void;
  /** The entry currently highlighted by the shared selection (S39). */
  highlightedPath?: string | null;
  /**
   * In-rail filter (left-rail IA ADR): a client-side narrowing of the visible,
   * already-fetched vault listing by stem/path/feature-tag — never a wire
   * search. Empty/absent shows the full tree.
   */
  filter?: string;
}

export function VaultBrowser({
  onEntryClick,
  highlightedPath,
  filter,
}: VaultBrowserProps) {
  const scope = useActiveScope();
  const tree = useVaultTree(scope);
  const availability = useVaultTreeAvailability(scope);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Bidirectional selection by default (S39): clicks select, selections
  // highlight; explicit props override for embedding contexts.
  const sharedHighlight = useHighlightedPath(tree.data?.entries);
  const clickHandler = onEntryClick ?? handleEntryClick;
  const highlight = highlightedPath ?? sharedHighlight;

  // TRUE roving-tabindex focus model (a11y contract, S21 review M1/M2): the
  // whole rail is ONE Tab-stop. Exactly one navigable element — a group
  // disclosure HEADER or a tree ROW — carries tabIndex 0 at a time (the
  // "active" key tracked here); every other navigable element is tabIndex -1.
  // Tab/Shift-Tab enters and leaves the rail; ArrowUp/ArrowDown move the active
  // "0" through the single linear list of headers and their visible rows in
  // top-to-bottom DOM order (header → its rows → next header), so a collapsed
  // group's header stays arrow-reachable to reopen it.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // Element registry keyed by a stable nav-key (never reset in render — M1/L1).
  // A Map keyed by `header:<group>` / `row:<path>` survives re-renders and
  // double-invoke without a render-phase side effect.
  const navEls = useRef(new Map<string, HTMLButtonElement>());
  const registerNav = useCallback(
    (key: string) => (el: HTMLButtonElement | null) => {
      if (el) navEls.current.set(key, el);
      else navEls.current.delete(key);
    },
    [],
  );
  // The ordered nav-key list for the CURRENT render (header then its rows when
  // expanded). Rebuilt each render so it tracks expand/collapse; used only by
  // the arrow handler at event time, so a render-time array is correct here.
  const navOrder = useRef<string[]>([]);
  const moveActive = useCallback((from: string, delta: number) => {
    const order = navOrder.current;
    const at = order.indexOf(from);
    if (at === -1) return;
    const next = order[Math.min(order.length - 1, Math.max(0, at + delta))];
    if (next === undefined) return;
    setActiveKey(next);
    navEls.current.get(next)?.focus();
  }, []);
  const navKeyDown = useCallback(
    (key: string) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveActive(key, 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveActive(key, -1);
      }
    },
    [moveActive],
  );

  if (tree.isPending) {
    // Loading: a quiet, copy-toned pending line — no spinner theatre. The
    // subtle liveness pulse is tied to genuine in-flight work, not ambient.
    return (
      <p
        className="animate-pulse-live px-vs-1 py-vs-0-5 text-label text-ink-faint"
        role="status"
        aria-live="polite"
      >
        reading the vault…
      </p>
    );
  }

  if (tree.isError && !availability.degraded) {
    // Error: a genuine /vault-tree failure — contained and non-alarming, scoped
    // to the browser region and distinguished from degradation so the user can
    // tell "this read failed" from "a backend is down". A tiers-bearing failure
    // (a backend tier reported down) is degradation, not a transport error, so
    // it falls through to the designed degraded banner below — only a tiers-less
    // transport fault renders this error state (degradation-is-read-from-tiers).
    return (
      <div className="space-y-vs-1 px-vs-1 py-vs-0-5" role="status" aria-live="polite">
        <p className="text-label text-state-broken">vault tree unavailable</p>
        <button
          type="button"
          onClick={() => void tree.refetch()}
          className="rounded-vs-sm text-label text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          try again
        </button>
      </div>
    );
  }

  const allEntries = tree.data?.entries ?? [];
  // In-rail filter: narrow the already-fetched listing client-side before
  // grouping (no wire request). A non-empty filter that matches nothing yields a
  // distinct "no matches" empty state below, not the "no documents" state.
  const activeFilter = (filter ?? "").trim();
  const filteredEntries = filterVaultEntries(allEntries, activeFilter);
  const groups = groupEntries(filteredEntries);
  const filteredToNothing = activeFilter.length > 0 && filteredEntries.length === 0;
  const now = Date.now();

  // Build the single linear nav order for THIS render: each group's header,
  // then (when expanded) its rows, in top-to-bottom order. Drives the arrow
  // handler and the roving-tabindex "0" placement. The active key defaults to
  // the first navigable element until the user moves it (M2 top-to-bottom).
  const order: string[] = [];
  for (const [group, entries] of groups) {
    order.push(`header:${group}`);
    if (!collapsed.has(group)) {
      for (const entry of entries) order.push(`row:${entry.path}`);
    }
  }
  navOrder.current = order;
  // Resolve the element that holds tabIndex 0: the tracked active key when it
  // is still present in the current order, else the first navigable element.
  const rovingKey =
    activeKey && order.includes(activeKey) ? activeKey : (order[0] ?? null);
  // Deterministic degraded reason (L2): pick the reason of the FIRST degraded
  // tier in the ordered `degradedTiers`, not an arbitrary Object.values order.
  const degradedReason =
    availability.degradedTiers.map((t) => availability.reasons[t]).find(Boolean) ?? "";

  return (
    <nav className="text-label" aria-label="vault browser" data-vault-browser>
      {/* Degraded: a tier the engine reports unavailable (or absent) renders as
          a designed degraded banner with the reason in copy tone — the tree
          still lists what it can, and the rail never presents a healthy-looking
          error. Read through the stores selector, never the raw tiers block. */}
      {availability.degraded && (
        <p
          className="mb-vs-1 rounded-vs-sm bg-accent-subtle/40 px-vs-1 py-vs-0-5 text-2xs text-ink-muted"
          role="status"
          aria-live="polite"
          data-vault-degraded
        >
          some of the corpus is unavailable right now
          {degradedReason ? ` — ${degradedReason}` : ""}. showing what loaded.
        </p>
      )}

      {groups.size === 0 ? (
        filteredToNothing ? (
          // Filtered to nothing: the listing IS present but the in-rail filter
          // matches no row — an honest, distinct state, not "no documents". The
          // filter is client-side; clearing it restores the full tree.
          <p
            className="px-vs-1 py-vs-0-5 text-label text-ink-faint"
            data-vault-filter-empty
          >
            no vault documents match the filter.
          </p>
        ) : (
          // Empty: an approachable empty state — a non-vault worktree resolving to
          // no documents is a real, common condition, not a fault.
          <p className="px-vs-1 py-vs-0-5 text-label text-ink-faint" data-vault-empty>
            no vault documents in this scope yet.
          </p>
        )
      ) : (
        [...groups.entries()].map(([group, entries]) => {
          const isCollapsed = collapsed.has(group);
          const sectionId = `vault-group-${group}`;
          const headerKey = `header:${group}`;
          return (
            <section key={group} className="mt-vs-1">
              <button
                ref={registerNav(headerKey)}
                type="button"
                aria-expanded={!isCollapsed}
                aria-controls={sectionId}
                tabIndex={rovingKey === headerKey ? 0 : -1}
                onKeyDown={navKeyDown(headerKey)}
                onFocus={() => setActiveKey(headerKey)}
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(group)) next.delete(group);
                    else next.add(group);
                    return next;
                  })
                }
                className="flex w-full items-center gap-vs-1 rounded-vs-sm py-vs-0-5 font-medium text-ink-muted transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
              >
                {isCollapsed ? (
                  <ChevronRight size={CHEVRON_PX} aria-hidden />
                ) : (
                  <ChevronDown size={CHEVRON_PX} aria-hidden />
                )}
                <span className="capitalize">{group}</span>
                <span className="text-ink-faint" data-tabular>
                  {entries.length}
                </span>
              </button>
              {!isCollapsed && (
                <ul id={sectionId} className="ml-vs-3 mt-vs-0-5 space-y-vs-0-5">
                  {entries.map((entry) => {
                    const fresh = freshnessLabel(entry.dates.modified, now);
                    const highlighted = entry.path === highlight;
                    const Mark = docMark(entry.doc_type);
                    const rowKey = `row:${entry.path}`;
                    return (
                      <li key={entry.path}>
                        <button
                          ref={registerNav(rowKey)}
                          type="button"
                          title={entry.path}
                          aria-current={highlighted ? "page" : undefined}
                          tabIndex={rovingKey === rowKey ? 0 : -1}
                          onClick={() => clickHandler(entry)}
                          onFocus={() => setActiveKey(rowKey)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            openContextMenu(vaultDocEntity(entry), {
                              x: e.clientX,
                              y: e.clientY,
                            });
                          }}
                          onKeyDown={(e) => {
                            // Keyboard menu entry (ContextMenu key / Shift+F10):
                            // anchor at the row's bottom-left, then fall through
                            // to the roving-tabindex arrow handler for everything
                            // else (preserves the single-Tab-stop nav model).
                            if (
                              e.key === "ContextMenu" ||
                              (e.shiftKey && e.key === "F10")
                            ) {
                              e.preventDefault();
                              const r = e.currentTarget.getBoundingClientRect();
                              openContextMenu(vaultDocEntity(entry), {
                                x: r.left,
                                y: r.bottom,
                              });
                              return;
                            }
                            navKeyDown(rowKey)(e);
                          }}
                          className={`flex w-full items-center gap-vs-1 truncate rounded-vs-sm px-vs-1 py-vs-0-5 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                            highlighted
                              ? "bg-accent-subtle font-medium text-ink"
                              : "text-ink-muted hover:bg-paper-sunken hover:text-ink"
                          }`}
                        >
                          {/* Grayscale-safe selection: the highlight rides fill
                              + weight, and a leading accent bar marks the active
                              row so the cue survives without hue. */}
                          <span
                            aria-hidden
                            className={`-ml-vs-0-5 h-3 w-0.5 shrink-0 rounded-full ${
                              highlighted ? "bg-accent" : "bg-transparent"
                            }`}
                          />
                          <span className="shrink-0 text-ink-faint">
                            <Mark size={DOC_MARK_PX} />
                          </span>
                          <span className="min-w-0 truncate font-mono">
                            {entryStem(entry.path)}
                          </span>
                          {entry.feature_tags[0] && (
                            <span className="shrink-0 text-ink-faint">
                              #{entry.feature_tags[0]}
                            </span>
                          )}
                          {fresh && (
                            <span
                              className={`ml-auto shrink-0 ${
                                isFresh(fresh) ? "text-state-active" : "text-ink-faint"
                              }`}
                              data-tabular
                            >
                              {fresh}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })
      )}
    </nav>
  );
}
