// Open-in-place node interiors (W02.P06.S24, ADR G3.b / G3.e).
//
// Opened nodes unfold IN PLACE as DOM islands. Structure that has a
// canonical order gets a canonical layout — never force-directed: a
// feature opens into its document lifecycle laid along the lifecycle axis
// (research → adr → plan → exec → audit); a plan opens into its tiered
// interior (steps with check state, exec records docked by the engine's
// interior subgraph). Clicking unfolded entries drives the one shared
// selection.

import type { EngineNode, NodeDetail } from "../../stores/server/engine";
import { useNodeDetail, useNodeNeighbors } from "../../stores/server/queries";
import { selectNode } from "../../stores/view/selection";

// --- canonical layout helpers (pure, unit-tested) -------------------------------

/** The lifecycle axis: every opened feature has the same internal grammar. */
export const LIFECYCLE_AXIS = ["research", "adr", "plan", "exec", "audit"] as const;

export function lifecycleRank(kind: string): number {
  const i = (LIFECYCLE_AXIS as readonly string[]).indexOf(kind);
  return i === -1 ? LIFECYCLE_AXIS.length : i;
}

/** Order a feature's documents along the lifecycle axis (stable by title). */
export function arrangeLifecycleAxis(nodes: readonly EngineNode[]): EngineNode[] {
  return nodes
    .filter((n) => lifecycleRank(n.kind) < LIFECYCLE_AXIS.length)
    .sort(
      (a, b) =>
        lifecycleRank(a.kind) - lifecycleRank(b.kind) ||
        (a.title ?? a.id).localeCompare(b.title ?? b.id),
    );
}

export interface InteriorStep {
  id: string;
  title: string;
  done: boolean;
}

/** The plan interior's tiered rows, in canonical identifier order. */
export function interiorSteps(interior: NodeDetail["interior"]): InteriorStep[] {
  if (!interior) return [];
  return interior.nodes
    .filter((n) => n.kind === "step")
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((n) => ({
      id: n.id,
      title: n.title ?? n.id,
      done: n.lifecycle?.state === "complete",
    }));
}

// --- the interior component --------------------------------------------------------

export function NodeInterior({ id }: { id: string }) {
  const detail = useNodeDetail(id);
  const kind = detail.data?.node.kind;
  if (detail.isPending) {
    return <p className="mt-1 text-stone-400">unfolding…</p>;
  }
  if (detail.isError || !detail.data) {
    return <p className="mt-1 text-amber-700">interior unavailable</p>;
  }
  if (kind === "feature") return <FeatureLifecycle id={id} />;
  if (kind === "plan") return <PlanInterior detail={detail.data} />;
  return <NodeSummary node={detail.data.node} />;
}

/** Feature → its document lifecycle along the canonical axis. */
function FeatureLifecycle({ id }: { id: string }) {
  const neighbors = useNodeNeighbors(id);
  if (!neighbors.data) {
    return <p className="mt-1 text-stone-400">unfolding lifecycle…</p>;
  }
  const docs = arrangeLifecycleAxis(neighbors.data.nodes);
  return (
    <ol className="mt-1 flex items-center gap-1" data-lifecycle-axis>
      {docs.map((doc, i) => (
        <li key={doc.id} className="flex items-center gap-1">
          {i > 0 && <span className="text-stone-300">→</span>}
          <button
            type="button"
            onClick={() => selectNode(doc.id)}
            className="rounded border border-stone-200 px-1 py-0.5 text-[10px] hover:border-stone-400"
            title={doc.title}
          >
            {doc.kind}
          </button>
        </li>
      ))}
    </ol>
  );
}

/** Plan → tiered interior with check state (canonical order, never force-laid). */
function PlanInterior({ detail }: { detail: NodeDetail }) {
  const steps = interiorSteps(detail.interior);
  const progress = detail.node.lifecycle?.progress;
  return (
    <div className="mt-1" data-plan-interior>
      {progress && (
        <p className="text-[10px] text-stone-500">
          {progress.done}/{progress.total} steps done
        </p>
      )}
      <ul className="mt-1 grid grid-cols-4 gap-1">
        {steps.map((step) => (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => selectNode(step.id)}
              className={`w-full rounded border px-1 py-0.5 text-[10px] ${
                step.done
                  ? "border-emerald-700/40 bg-emerald-50 text-emerald-900"
                  : "border-stone-200 text-stone-600"
              }`}
            >
              {step.done ? "✓ " : ""}
              {step.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NodeSummary({ node }: { node: EngineNode }) {
  return (
    <dl className="mt-1 text-[10px] text-stone-500">
      <div>
        <dt className="inline font-medium">kind:</dt>{" "}
        <dd className="inline">{node.kind}</dd>
      </div>
      {node.lifecycle && (
        <div>
          <dt className="inline font-medium">state:</dt>{" "}
          <dd className="inline">{node.lifecycle.state}</dd>
        </div>
      )}
    </dl>
  );
}
