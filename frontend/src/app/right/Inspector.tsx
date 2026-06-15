// The inspector (W03.P10.S42, ADR G2.b / G3.c): where "node as a live
// lens" pays off in prose form — the stage shows the shape, the inspector
// shows the evidence. Renders the selected node's metadata, evidence
// (documents, resolved code locations with state, correlated commits),
// and the per-tier edge list, collapsed by default and unfolding on
// selection (the Unfolding Edges pattern).

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { openContextMenu } from "../../stores/view/contextMenu";
import type { EngineEdge } from "../../stores/server/engine";
import {
  useNodeDetail,
  useNodeEvidence,
  useNodeNeighbors,
} from "../../stores/server/queries";
import { usePinStore } from "../../stores/view/pins";
import { selectEdge } from "../../stores/view/selection";
import { useViewStore } from "../../stores/view/viewStore";

// The edge resolver self-registers at module load. The "node" kind is served by
// the canonical graph node resolver (registered via app/menus/registerAll), since
// the inspector node and the stage node are the same entity - one resolver.
import "./menus/edgeMenu";

/** Bounded-list summary (contract §5): never silently partial. */
export function eventTouchSummary(nodeIds: string[], truncated?: number): string {
  const base = `touches ${nodeIds.join(", ")}`;
  return truncated && truncated > 0 ? `${base} +${truncated} more` : base;
}

// --- pure tier grouping (unit-tested) -----------------------------------------------

export const TIER_LIST_ORDER = [
  "declared",
  "structural",
  "temporal",
  "semantic",
] as const;

export function edgesByTier(
  edges: readonly EngineEdge[] | undefined,
): Map<string, EngineEdge[]> {
  const groups = new Map<string, EngineEdge[]>();
  for (const tier of TIER_LIST_ORDER) {
    const members = (edges ?? []).filter((e) => e.tier === tier && !e.meta);
    if (members.length > 0) groups.set(tier, members);
  }
  return groups;
}

// --- the inspector --------------------------------------------------------------------

export function Inspector() {
  const selection = useViewStore((s) => s.selection);
  const nodeId = selection?.kind === "node" ? selection.id : null;
  const detail = useNodeDetail(nodeId);
  const evidence = useNodeEvidence(nodeId);
  const neighbors = useNodeNeighbors(nodeId);
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());

  if (!selection) {
    return <p className="text-body text-ink-faint">select something to inspect</p>;
  }
  if (selection.kind === "event") {
    return (
      <div className="text-body" data-inspector>
        <div className="font-medium text-ink">event {selection.id}</div>
        <p className="text-ink-muted">
          {eventTouchSummary(selection.nodeIds, selection.truncatedNodeIds)}
        </p>
      </div>
    );
  }
  if (selection.kind === "edge") {
    return (
      <div className="text-body" data-inspector>
        <div className="font-medium text-ink">edge {selection.id}</div>
      </div>
    );
  }
  if (detail.isPending) return <p className="text-body text-ink-faint">inspecting…</p>;
  if (detail.isError || !detail.data) {
    return <p className="text-body text-state-broken">node unavailable</p>;
  }

  const node = detail.data.node;
  const tiers = edgesByTier(neighbors.data?.edges);

  // The NodeEntity the header region publishes to the context-menu host. Built
  // from the inspected node plus the view-store membership flags (open / pinned /
  // working-set) so the resolver can offer the right pin/unpin and omit a
  // redundant open-island. Read at event time, not render time.
  const nodeEntity = () => {
    const view = useViewStore.getState();
    return {
      kind: "node" as const,
      id: node.id,
      title: node.title ?? undefined,
      isOpen: view.openedIds.includes(node.id),
      isPinned: usePinStore.getState().isPinned(node.id),
      inWorkingSet: view.workingSet.includes(node.id),
    };
  };

  return (
    <div className="space-y-vs-2 text-body" data-inspector>
      <div
        tabIndex={0}
        aria-label={`node ${node.title ?? node.id}`}
        className="rounded-vs-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu(nodeEntity(), { x: e.clientX, y: e.clientY });
        }}
        onKeyDown={(e) => {
          if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            openContextMenu(nodeEntity(), { x: r.left, y: r.bottom });
          }
        }}
      >
        {/* Title: 13px medium (text-body) over an 11px muted sub-line — the
            binding design's inspector header (node 17:618). */}
        <div className="truncate font-medium text-ink" title={node.id}>
          {node.title ?? node.id}
        </div>
        <p className="text-label text-ink-muted">
          {node.kind}
          {node.lifecycle ? ` · ${node.lifecycle.state}` : ""}
          {node.lifecycle?.progress
            ? ` · ${node.lifecycle.progress.done}/${node.lifecycle.progress.total}`
            : ""}
          {node.dates?.modified ? ` · ${node.dates.modified.slice(0, 10)}` : ""}
        </p>
      </div>

      {evidence.data && (
        <section className="text-label">
          <div className="mb-vs-0-5 font-medium text-ink-muted">evidence</div>
          <ul className="space-y-vs-0-5 text-ink-muted">
            {evidence.data.documents.slice(0, 5).map((doc) => (
              <li key={doc.path} className="truncate" title={doc.path}>
                {doc.doc_type}: {doc.path.replace(/^.*\//, "")}
              </li>
            ))}
            {evidence.data.code_locations.map((loc) => (
              <li key={loc.path} className="truncate">
                code: {loc.path}
                <span
                  className={
                    loc.state === "resolved" ? "text-state-active" : "text-state-broken"
                  }
                >
                  {" "}
                  ({loc.state})
                </span>
              </li>
            ))}
            {evidence.data.commits.map((commit) => (
              <li key={commit.sha} className="truncate" title={commit.subject}>
                commit {commit.sha.slice(0, 7)}: {commit.subject}
                {commit.rule && (
                  <span className="text-ink-faint"> · via {commit.rule}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="text-label">
        <div className="mb-vs-0-5 font-medium text-ink-muted">edges by tier</div>
        {[...tiers.entries()].map(([tier, edges]) => {
          const open = unfolded.has(tier);
          return (
            <div key={tier} className="mb-vs-0-5">
              <button
                type="button"
                aria-expanded={open}
                onClick={() =>
                  setUnfolded((prev) => {
                    const next = new Set(prev);
                    if (next.has(tier)) next.delete(tier);
                    else next.add(tier);
                    return next;
                  })
                }
                className="flex items-center gap-vs-1 rounded-vs-sm text-ink-muted transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
              >
                {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                <span>{tier}</span>
                <span className="text-2xs text-ink-faint" data-tabular>
                  {edges.length}
                </span>
              </button>
              {open && (
                <ul className="ml-vs-3 mt-vs-0-5 space-y-vs-0-5 text-ink-muted">
                  {edges.map((edge) => (
                    <li key={edge.id}>
                      <button
                        type="button"
                        className="truncate text-left hover:underline"
                        title={edge.id}
                        onClick={() => selectEdge(edge.id)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          openContextMenu(
                            {
                              kind: "edge",
                              id: edge.id,
                              relation: edge.relation,
                              dst: edge.dst,
                              tier: edge.tier,
                            },
                            { x: e.clientX, y: e.clientY },
                          );
                        }}
                        onKeyDown={(e) => {
                          if (
                            e.key === "ContextMenu" ||
                            (e.shiftKey && e.key === "F10")
                          ) {
                            e.preventDefault();
                            const r = e.currentTarget.getBoundingClientRect();
                            openContextMenu(
                              {
                                kind: "edge",
                                id: edge.id,
                                relation: edge.relation,
                                dst: edge.dst,
                                tier: edge.tier,
                              },
                              { x: r.left, y: r.bottom },
                            );
                          }
                        }}
                      >
                        {edge.relation} →{" "}
                        {edge.dst.replace(/^(doc|feature|code|commit):/, "")}
                        {edge.state ? ` (${edge.state})` : ""}
                        {edge.tier !== "declared"
                          ? ` · ${Math.round(edge.confidence * 100)}%`
                          : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
