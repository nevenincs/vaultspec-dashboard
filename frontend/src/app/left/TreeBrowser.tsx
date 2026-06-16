// The TREE browser (Figma `LeftRail_tree`, node 40:2) — the third file-thinking
// mode of the left rail. It is a PURE CLIENT-SIDE PROJECTION of the very same
// `/vault-tree` response the vault browser reads, re-nested feature → doc_type →
// document (views-are-projections-of-one-model). There is NO engine work and NO
// new model: it reuses the existing `useVaultTree()` stores hook, reads
// degradation ONLY through the stores selector (never the raw `tiers` block), and
// joins selection on the same stable `doc:<stem>` node id the vault browser uses
// (dashboard-layer-ownership). It fetches nothing and mints no identity — chrome
// over the one projection.
//
// Shape (binding design):
//   #feature-tag                                  ← level 0, count on the right
//     ▸ Research / ADR / Plan / Exec / Audit …    ← level 1, doc-type group
//         …-stem                                  ← level 2, the document rows
//
// Each level is a collapsible disclosure (collapsed chevron points RIGHT,
// expanded DOWN). Plan documents carry the grayscale-safe plan-status pip; the
// selected document row gets the soft accent background + the leading accent bar
// (exactly one selected row, as in the vault browser). The in-rail filter narrows
// the already-fetched listing client-side — never a wire request.

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
// module runs its `registerResolver("vault-doc", …)` side effect once. The tree
// rows are the SAME vault documents, so they share the vault-doc menu.
import "./menus/vaultDocMenu";
// Shared row presentation — the SAME marks/freshness/sizing the vault browser
// paints with, so the two `/vault-tree` projections never drift.
import {
  CHEVRON_PX,
  DOC_MARK_PX,
  docGroupLabel,
  docMark,
  freshnessLabel,
  isFresh,
  planStatus,
  planStatusLabel,
  planStatusMark,
  planStatusToneClass,
  STATUS_MARK_PX,
  VAULT_GROUPS,
} from "./vaultRowPresentation";

// --- pure projection helpers (unit-tested) ---------------------------------------

/** One feature group: its tag and the doc-type sub-groups beneath it. */
export interface FeatureGroup {
  /** The feature tag (without the leading `#`). */
  feature: string;
  /** Total document count across all doc types in the feature. */
  count: number;
  /** Doc-type sub-groups, in canonical `.vault/` order then alphabetical. */
  docTypes: { docType: string; entries: VaultTreeEntry[] }[];
}

/** Display stem — the shared derivation from the selection join. */
export function entryStem(path: string): string {
  return pathStem(path);
}

/**
 * Order doc types canonically (research → adr → plan → exec → audit → reference →
 * index), then any unknown types alphabetically — the SAME order the vault
 * browser groups by, applied within each feature.
 */
function orderDocTypes(present: Iterable<string>): string[] {
  // Materialize the iterable once — re-spreading a consumed iterator yields
  // nothing, so capture the present doc types into a Set up front.
  const presentSet = new Set(present);
  const order: string[] = [...VAULT_GROUPS];
  for (const extra of [...presentSet].sort()) {
    if (!order.includes(extra)) order.push(extra);
  }
  return order.filter((t) => presentSet.has(t));
}

/**
 * Project the flat `/vault-tree` entries into the feature → doc_type → document
 * nesting the tree mode renders. Features are ordered by FIRST appearance in the
 * entry list (stable, matching the corpus order the engine serves); within a
 * feature the doc types follow the canonical `.vault/` order. An entry with no
 * feature tag is collected under a single "(untagged)" feature so it is never
 * silently dropped (honest projection). A pure derivation — no fetch.
 */
export function projectFeatureGroups(
  entries: readonly VaultTreeEntry[],
): FeatureGroup[] {
  const UNTAGGED = "(untagged)";
  // feature → docType → entries, preserving first-seen feature order.
  const byFeature = new Map<string, Map<string, VaultTreeEntry[]>>();
  for (const entry of entries) {
    const features = entry.feature_tags.length > 0 ? entry.feature_tags : [UNTAGGED];
    for (const feature of features) {
      let docMap = byFeature.get(feature);
      if (!docMap) {
        docMap = new Map();
        byFeature.set(feature, docMap);
      }
      const list = docMap.get(entry.doc_type) ?? [];
      list.push(entry);
      docMap.set(entry.doc_type, list);
    }
  }

  const groups: FeatureGroup[] = [];
  for (const [feature, docMap] of byFeature) {
    const docTypes = orderDocTypes(docMap.keys()).map((docType) => ({
      docType,
      entries: docMap
        .get(docType)!
        .slice()
        .sort((a, b) => a.path.localeCompare(b.path)),
    }));
    const count = docTypes.reduce((n, g) => n + g.entries.length, 0);
    groups.push({ feature, count, docTypes });
  }
  return groups;
}

/**
 * Client-side narrowing of the ALREADY-FETCHED vault listing (the in-rail
 * filter), matching a row on its stem, full path, or any feature tag — the SAME
 * predicate the vault browser uses. Issues NO wire request. Empty/absent shows
 * all. Pure (unit-tested).
 */
export function filterTreeEntries(
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

// --- component -------------------------------------------------------------------

export interface TreeBrowserProps {
  /** Row click handler (defaults to the shared bidirectional selection). */
  onEntryClick?: (entry: VaultTreeEntry) => void;
  /** The document path currently highlighted by the shared selection. */
  highlightedPath?: string | null;
  /** In-rail filter — a client-side narrowing of the visible listing by
   *  stem/path/feature-tag, never a wire search. Empty/absent shows all. */
  filter?: string;
}

/** Build the vault-doc context-menu entity from a tree row's data (shared with
 *  the vault browser — the rows are the same documents). */
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

export function TreeBrowser({
  onEntryClick,
  highlightedPath,
  filter,
}: TreeBrowserProps) {
  const scope = useActiveScope();
  const tree = useVaultTree(scope);
  const availability = useVaultTreeAvailability(scope);
  const sharedHighlight = useHighlightedPath(tree.data?.entries);
  const clickHandler = onEntryClick ?? handleEntryClick;
  const highlight = highlightedPath ?? sharedHighlight;

  // Collapsed state, keyed by a stable nav-key: feature groups `f:<feature>` and
  // doc-type sub-groups `d:<feature>/<docType>`. Both default to EXPANDED (the
  // binding design shows the whole nesting open); collapsing a node hides its
  // descendants. A Set of collapsed keys keeps the open state the default.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapsed = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // TRUE roving-tabindex focus model (matching the vault browser): the whole rail
  // is ONE Tab-stop. Exactly one navigable element carries tabIndex 0; ArrowUp/
  // ArrowDown move it through the single linear list of VISIBLE nodes in
  // top-to-bottom DOM order (feature header → its doc-type headers → their rows).
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const navEls = useRef(new Map<string, HTMLButtonElement>());
  const registerNav = useCallback(
    (key: string) => (el: HTMLButtonElement | null) => {
      if (el) navEls.current.set(key, el);
      else navEls.current.delete(key);
    },
    [],
  );
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
    (key: string, opts?: { onArrowRight?: () => void; onArrowLeft?: () => void }) =>
      (e: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          moveActive(key, 1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          moveActive(key, -1);
        } else if (e.key === "ArrowRight" && opts?.onArrowRight) {
          e.preventDefault();
          opts.onArrowRight();
        } else if (e.key === "ArrowLeft" && opts?.onArrowLeft) {
          e.preventDefault();
          opts.onArrowLeft();
        }
      },
    [moveActive],
  );

  if (tree.isPending) {
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
    // A genuine tiers-less transport failure — contained, distinguished from
    // degradation (degradation-is-read-from-tiers).
    return (
      <div
        className="space-y-fg-1 px-fg-1 py-fg-0-5"
        role="status"
        aria-live="polite"
        data-tree-error
      >
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
  const activeFilter = (filter ?? "").trim();
  const filteredEntries = filterTreeEntries(allEntries, activeFilter);
  const groups = projectFeatureGroups(filteredEntries);
  const filteredToNothing = activeFilter.length > 0 && filteredEntries.length === 0;
  const now = Date.now();

  // Build the single linear nav order for THIS render: each VISIBLE node, in
  // top-to-bottom order (feature header → doc-type header → rows), skipping the
  // descendants of any collapsed node. Drives arrow movement and the roving "0".
  const order: string[] = [];
  for (const group of groups) {
    const fKey = `f:${group.feature}`;
    order.push(fKey);
    if (collapsed.has(fKey)) continue;
    for (const sub of group.docTypes) {
      const dKey = `d:${group.feature}/${sub.docType}`;
      order.push(dKey);
      if (collapsed.has(dKey)) continue;
      for (const entry of sub.entries) order.push(`r:${entry.path}`);
    }
  }
  navOrder.current = order;
  const rovingKey =
    activeKey && order.includes(activeKey) ? activeKey : (order[0] ?? null);
  const degradedReason =
    availability.degradedTiers.map((t) => availability.reasons[t]).find(Boolean) ?? "";

  return (
    <nav className="text-label" aria-label="tree browser" data-tree-browser>
      {availability.degraded && (
        <p
          className="mb-fg-1 rounded-fg-xs bg-accent-subtle/40 px-fg-1 py-fg-0-5 text-caption text-ink-muted"
          role="status"
          aria-live="polite"
          data-tree-degraded
        >
          some of the corpus is unavailable right now
          {degradedReason ? ` — ${degradedReason}` : ""}. showing what loaded.
        </p>
      )}

      {groups.length === 0 ? (
        filteredToNothing ? (
          <p
            className="px-fg-1 py-fg-0-5 text-label text-ink-faint"
            data-tree-filter-empty
          >
            no vault documents match the filter.
          </p>
        ) : (
          <p className="px-fg-1 py-fg-0-5 text-label text-ink-faint" data-tree-empty>
            no vault documents in this scope yet.
          </p>
        )
      ) : (
        <div className="space-y-fg-0-5">
          {groups.map((group) => {
            const fKey = `f:${group.feature}`;
            const fCollapsed = collapsed.has(fKey);
            const fSectionId = `tree-feature-${group.feature}`;
            return (
              <section key={group.feature} data-tree-feature>
                {/* Level 0 — the #feature header (Figma `#constellation-live-delta`):
                    chevron + a SEMIBOLD body-ink `#tag`, count quietly right-aligned. */}
                <button
                  ref={registerNav(fKey)}
                  type="button"
                  aria-expanded={!fCollapsed}
                  aria-controls={fSectionId}
                  tabIndex={rovingKey === fKey ? 0 : -1}
                  onClick={() => toggleCollapsed(fKey)}
                  onFocus={() => setActiveKey(fKey)}
                  onKeyDown={navKeyDown(fKey, {
                    onArrowRight: () => fCollapsed && toggleCollapsed(fKey),
                    onArrowLeft: () => !fCollapsed && toggleCollapsed(fKey),
                  })}
                  className="flex w-full items-center gap-fg-1 rounded-fg-xs px-fg-1 py-fg-0-5 font-semibold text-ink transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                >
                  {fCollapsed ? (
                    <ChevronRight size={CHEVRON_PX} aria-hidden />
                  ) : (
                    <ChevronDown size={CHEVRON_PX} aria-hidden />
                  )}
                  <span className="min-w-0 truncate" data-tree-feature-tag>
                    #{group.feature}
                  </span>
                  <span className="ml-auto text-caption text-ink-faint" data-tabular>
                    {group.count}
                  </span>
                </button>

                {!fCollapsed && (
                  <div id={fSectionId} className="mt-fg-0-5 space-y-fg-0-5">
                    {group.docTypes.map((sub) => {
                      const dKey = `d:${group.feature}/${sub.docType}`;
                      const dCollapsed = collapsed.has(dKey);
                      const dSectionId = `tree-doctype-${group.feature}-${sub.docType}`;
                      const GroupMark = docMark(sub.docType);
                      return (
                        <div key={sub.docType} data-tree-doctype>
                          {/* Level 1 — the doc-type group header: indented one step,
                              chevron + doc-type mark + a SEMIBOLD capitalised label. */}
                          <button
                            ref={registerNav(dKey)}
                            type="button"
                            aria-expanded={!dCollapsed}
                            aria-controls={dSectionId}
                            tabIndex={rovingKey === dKey ? 0 : -1}
                            onClick={() => toggleCollapsed(dKey)}
                            onFocus={() => setActiveKey(dKey)}
                            onKeyDown={navKeyDown(dKey, {
                              onArrowRight: () => dCollapsed && toggleCollapsed(dKey),
                              onArrowLeft: () => !dCollapsed && toggleCollapsed(dKey),
                            })}
                            className="flex w-full items-center gap-fg-1 rounded-fg-xs py-fg-0-5 pl-fg-3 pr-fg-1 font-semibold text-ink transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                          >
                            {dCollapsed ? (
                              <ChevronRight size={CHEVRON_PX} aria-hidden />
                            ) : (
                              <ChevronDown size={CHEVRON_PX} aria-hidden />
                            )}
                            <span className="shrink-0 text-ink-faint" aria-hidden>
                              <GroupMark size={DOC_MARK_PX} />
                            </span>
                            <span>{docGroupLabel(sub.docType)}</span>
                            <span
                              className="ml-auto text-caption text-ink-faint"
                              data-tabular
                            >
                              {sub.entries.length}
                            </span>
                          </button>

                          {!dCollapsed && (
                            <ul id={dSectionId} className="space-y-fg-0-5">
                              {sub.entries.map((entry) => (
                                <TreeRow
                                  key={entry.path}
                                  entry={entry}
                                  isPlan={sub.docType === "plan"}
                                  highlighted={entry.path === highlight}
                                  fresh={freshnessLabel(entry.dates.modified, now)}
                                  rovingKey={rovingKey}
                                  registerNav={registerNav}
                                  setActiveKey={setActiveKey}
                                  navKeyDown={navKeyDown}
                                  onClick={() => clickHandler(entry)}
                                  entity={vaultDocEntity(entry)}
                                />
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </nav>
  );
}

// --- the document row (level 2) --------------------------------------------------

interface TreeRowProps {
  entry: VaultTreeEntry;
  isPlan: boolean;
  highlighted: boolean;
  fresh: string;
  rovingKey: string | null;
  registerNav: (key: string) => (el: HTMLButtonElement | null) => void;
  setActiveKey: (key: string) => void;
  navKeyDown: (key: string) => (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onClick: () => void;
  entity: VaultDocEntity;
}

/** One document row at level 2 (Figma `DocumentRow` at `pl-36px`): the leading
 *  selection cue (a plan-status pip for PLAN rows, else the 2px accent bar), the
 *  stem, the freshness label. The selected row alone gets the accent background +
 *  bar — exactly one selected row across the whole tree. */
function TreeRow({
  entry,
  isPlan,
  highlighted,
  fresh,
  rovingKey,
  registerNav,
  setActiveKey,
  navKeyDown,
  onClick,
  entity,
}: TreeRowProps) {
  const rowKey = `r:${entry.path}`;
  // Plan-status pip: derived from the entry's real checkbox progress, projected
  // by the engine `/vault-tree` route from the SAME `lifecycle_in_scope` facet
  // the node-graph pipeline reads. Absent progress reads the honest not-started
  // baseline. The pip REPLACES the accent bar slot for plan rows, exactly as the
  // binding design paints it.
  const status = isPlan ? planStatus(entry.progress) : null;
  const StatusMark = status ? planStatusMark(status) : null;

  return (
    <li>
      <button
        ref={registerNav(rowKey)}
        type="button"
        title={entry.path}
        aria-current={highlighted ? "page" : undefined}
        tabIndex={rovingKey === rowKey ? 0 : -1}
        onClick={onClick}
        onFocus={() => setActiveKey(rowKey)}
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu(entity, { x: e.clientX, y: e.clientY });
        }}
        onKeyDown={(e) => {
          if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            openContextMenu(entity, { x: r.left, y: r.bottom });
            return;
          }
          navKeyDown(rowKey)(e);
        }}
        // Level-2 indent (Figma `pl-36px`) lines the rows up under the doc-type
        // mark; the leading cue + stem + freshness follow.
        className={`flex w-full items-center gap-fg-1 truncate rounded-fg-xs py-fg-0-5 pl-fg-6 pr-fg-1 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
          highlighted
            ? "bg-accent-subtle font-medium text-ink"
            : "text-ink-muted hover:bg-paper-sunken hover:text-ink"
        }`}
      >
        {StatusMark && status ? (
          // Plan rows: a grayscale-safe status pip (✓ / ◐ / ○) in place of the
          // accent bar. When this row is ALSO selected, the accent bar wins the
          // leading slot (selection is the louder cue) and the pip rides beside it.
          <>
            <span
              aria-hidden
              className={`-ml-fg-0-5 h-3 w-0.5 shrink-0 rounded-full ${
                highlighted ? "bg-accent" : "bg-transparent"
              }`}
            />
            <span
              className={`shrink-0 ${planStatusToneClass(status)}`}
              aria-label={`plan ${planStatusLabel(status)}`}
              data-plan-status={status}
            >
              <StatusMark size={STATUS_MARK_PX} />
            </span>
          </>
        ) : (
          <span
            aria-hidden
            className={`-ml-fg-0-5 h-3 w-0.5 shrink-0 rounded-full ${
              highlighted ? "bg-accent" : "bg-transparent"
            }`}
          />
        )}
        <span className="min-w-0 truncate">{entryStem(entry.path)}</span>
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
}
