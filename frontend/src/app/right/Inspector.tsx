// The inspector (W03.P10.S42, ADR G2.b / G3.c): where "node as a live
// lens" pays off in prose form — the stage shows the shape, the inspector
// shows the evidence. Renders the selected node's metadata, evidence
// (documents, resolved code locations with state, correlated commits),
// and the per-tier edge list, collapsed by default and unfolding on
// selection (the Unfolding Edges pattern).

import { useState } from "react";

import type { EngineEdge } from "../../stores/server/engine";
import {
  useNodeDetail,
  useNodeEvidence,
  useNodeNeighbors,
} from "../../stores/server/queries";
import { selectEdge } from "../../stores/view/selection";
import { useViewStore } from "../../stores/view/viewStore";

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
    return <p className="text-xs text-stone-400">select something to inspect</p>;
  }
  if (selection.kind === "event") {
    return (
      <div className="text-xs" data-inspector>
        <div className="font-medium text-stone-700">event {selection.id}</div>
        <p className="text-stone-500">touches {selection.nodeIds.join(", ")}</p>
      </div>
    );
  }
  if (selection.kind === "edge") {
    return (
      <div className="text-xs" data-inspector>
        <div className="font-medium text-stone-700">edge {selection.id}</div>
      </div>
    );
  }
  if (detail.isPending) return <p className="text-xs text-stone-400">inspecting…</p>;
  if (detail.isError || !detail.data) {
    return <p className="text-xs text-amber-700">node unavailable</p>;
  }

  const node = detail.data.node;
  const tiers = edgesByTier(neighbors.data?.edges);

  return (
    <div className="space-y-2 text-xs" data-inspector>
      <div>
        <div className="truncate font-medium text-stone-800" title={node.id}>
          {node.title ?? node.id}
        </div>
        <p className="text-stone-500">
          {node.kind}
          {node.lifecycle ? ` · ${node.lifecycle.state}` : ""}
          {node.lifecycle?.progress
            ? ` · ${node.lifecycle.progress.done}/${node.lifecycle.progress.total}`
            : ""}
          {node.dates?.modified ? ` · ${node.dates.modified.slice(0, 10)}` : ""}
        </p>
      </div>

      {evidence.data && (
        <section>
          <div className="font-medium text-stone-600">evidence</div>
          <ul className="text-stone-500">
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
                    loc.state === "resolved" ? "text-emerald-700" : "text-amber-700"
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
                  <span className="text-stone-400"> · via {commit.rule}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="font-medium text-stone-600">edges by tier</div>
        {[...tiers.entries()].map(([tier, edges]) => {
          const open = unfolded.has(tier);
          return (
            <div key={tier}>
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
                className="text-stone-600 hover:text-stone-900"
              >
                {open ? "▾" : "▸"} {tier}{" "}
                <span className="text-stone-400">{edges.length}</span>
              </button>
              {open && (
                <ul className="ml-3 text-stone-500">
                  {edges.map((edge) => (
                    <li key={edge.id}>
                      <button
                        type="button"
                        className="truncate text-left hover:underline"
                        title={edge.id}
                        onClick={() => selectEdge(edge.id)}
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
