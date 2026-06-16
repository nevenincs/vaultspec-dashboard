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

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useRef, useState } from "react";

import { Chip, SectionLabel, StatusDot } from "../kit";
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
// Shared row presentation (doc marks, freshness, sizing) — the SAME helpers the
// tree browser paints with, so the two projections of `/vault-tree` never drift.
import {
  DOC_MARK_PX,
  docMark,
  docMarkName as sharedDocMarkName,
  docGroupLabel,
  docTypeCategory,
  freshnessLabel as sharedFreshnessLabel,
  isFresh as sharedIsFresh,
  planStatus,
  planStatusLabel,
  planStatusMark,
  planStatusToneClass,
  STATUS_MARK_PX,
  VAULT_GROUPS as SHARED_VAULT_GROUPS,
} from "./vaultRowPresentation";

// Re-exported from the shared presentation module so existing importers (and the
// unit test) keep their stable import surface while the definitions live in ONE
// place shared with the tree browser.
export const VAULT_GROUPS = SHARED_VAULT_GROUPS;
export const docMarkName = sharedDocMarkName;
export const freshnessLabel = sharedFreshnessLabel;
export const isFresh = sharedIsFresh;

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

/** Display stem — the shared derivation from the selection join (024). */
export function entryStem(path: string): string {
  return pathStem(path);
}

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
        className="animate-pulse-live px-fg-1 py-fg-0-5 text-label text-ink-faint"
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
      <div className="space-y-fg-1 px-fg-1 py-fg-0-5" role="status" aria-live="polite">
        <p className="text-label text-state-broken">vault tree unavailable</p>
        <button
          type="button"
          onClick={() => void tree.refetch()}
          className="rounded-fg-xs text-label text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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

  // Build the single linear nav order for THIS render: every visible row, in
  // top-to-bottom order. The binding `LeftRail` 244:750 vault state paints flat
  // sections — a quiet SectionLabel eyebrow with NO disclosure twisty and NO
  // count, all rows always visible — so the section headers are not navigable
  // controls and the roving-tabindex "0" rides the rows alone.
  const order: string[] = [];
  for (const [, entries] of groups) {
    for (const entry of entries) order.push(`row:${entry.path}`);
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
          className="mb-fg-1 rounded-fg-xs bg-accent-subtle/40 px-fg-1 py-fg-0-5 text-caption text-ink-muted"
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
            className="px-fg-1 py-fg-0-5 text-label text-ink-faint"
            data-vault-filter-empty
          >
            no vault documents match the filter.
          </p>
        ) : (
          // Empty: an approachable empty state — a non-vault worktree resolving to
          // no documents is a real, common condition, not a fault.
          <p className="px-fg-1 py-fg-0-5 text-label text-ink-faint" data-vault-empty>
            no vault documents in this scope yet.
          </p>
        )
      ) : (
        [...groups.entries()].map(([group, entries]) => {
          // Per-group leading cue: the doc type's bound scene/category color (the
          // kit StatusDot), with the doc-type mark as the fallback for a type with
          // no bound color (e.g. reference).
          const rowCategory = docTypeCategory(group);
          const FallbackMark = docMark(group);
          return (
            <section key={group} className="mt-fg-2 first:mt-0">
              {/* Flat group header (binding `LeftRail` 244:750 vault state): a
                  quiet kit SectionLabel eyebrow — NO disclosure twisty, NO count.
                  The board paints flat, always-expanded sections. */}
              <SectionLabel className="px-fg-1">{docGroupLabel(group)}</SectionLabel>
              <ul className="mt-fg-0-5 space-y-fg-0-5">
                {entries.map((entry) => {
                  const fresh = freshnessLabel(entry.dates.modified, now);
                  const highlighted = entry.path === highlight;
                  const rowKey = `row:${entry.path}`;
                  // Plan rows carry the grayscale-safe status pip (✓/◐/○) in the
                  // leading slot, derived from the engine-projected checkbox
                  // progress (the SAME `lifecycle_in_scope` facet the node graph
                  // reads). Absent progress reads the honest not-started baseline.
                  const status = group === "plan" ? planStatus(entry.progress) : null;
                  const StatusMark = status ? planStatusMark(status) : null;
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
                        className={`flex w-full min-w-0 items-center gap-fg-1-5 rounded-r-fg-xs border-l-2 py-fg-0-5 pe-fg-1 ps-fg-2 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                          highlighted
                            ? "border-l-accent bg-accent-subtle font-medium text-accent-text"
                            : "border-l-transparent text-ink-muted hover:bg-paper-sunken hover:text-ink"
                        }`}
                      >
                        {/* Leading category cue (binding `LeftRail` 244:750 row):
                              the kit StatusDot tinted by the doc type's bound scene/
                              category color, so the dot and its graph node agree.
                              PLAN rows instead carry the grayscale-safe status pip
                              (✓/◐/○); a doc type with no bound color (reference)
                              falls back to its doc-type mark so the row is never
                              blank. Selection is the kit ListRow treatment — a 2px
                              left accent bar + accent-subtle tint on the row. */}
                        {StatusMark && status ? (
                          <span
                            className={`flex shrink-0 items-center ${planStatusToneClass(status)}`}
                            aria-label={`plan ${planStatusLabel(status)}`}
                            data-plan-status={status}
                          >
                            <StatusMark size={STATUS_MARK_PX} />
                          </span>
                        ) : rowCategory ? (
                          <span className="flex shrink-0 items-center">
                            <StatusDot category={rowCategory} />
                          </span>
                        ) : (
                          <span
                            className="flex shrink-0 items-center text-ink-faint"
                            aria-hidden
                          >
                            <FallbackMark size={DOC_MARK_PX} />
                          </span>
                        )}
                        <span className="min-w-0 shrink truncate">
                          {entryStem(entry.path)}
                        </span>
                        {/* Feature tag as the kit Chip (feature-toned), matching
                              the binding row's #feature-tag chip. */}
                        {entry.feature_tags[0] && (
                          <Chip category="feature">#{entry.feature_tags[0]}</Chip>
                        )}
                        {fresh && (
                          <span
                            className={`ml-auto shrink-0 text-caption ${
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
            </section>
          );
        })
      )}
    </nav>
  );
}
