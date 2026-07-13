// Open-in-place node interiors (W02.P06.S24 / recodified W02.P09.S25,
// node-canvas ADR G3.b / "The browse interaction").
//
// Opened nodes unfold IN PLACE as DOM islands rendered as a reviewable,
// scannable document in the cohort's instrument grammar — never force-directed.
// Structure that has a canonical order gets a canonical layout: a feature opens
// into its document lifecycle along the lifecycle axis (research → adr → plan →
// exec → audit); a plan opens into its tiered steps with check state. Clicking
// any unfolded entry drives the one shared selection.
//
// Recodification (S25): the interior is brought fully onto the token layer and
// the shared domain-mark registry. Identity (the node id) is monospace; counts
// and progress are tabular numerals; lifecycle state carries a grayscale-safe
// StateMark (shape, not hue, is the primary channel); doc-type entries carry
// their DocTypeMark silhouette. Every color comes from a state/ink token, none
// hard-coded. The interior reads stores hooks only — it never fetches and never
// reads the raw `tiers` block (dashboard-layer-ownership).

import type { EngineNode, NodeDetail } from "../../stores/server/engine";
import {
  useFeatureLifecycleView,
  useNodeDetailView,
} from "../../stores/server/queries";
import { DocTypeMark, StateMark } from "../../scene/field/markComponents";
import { useDashboardNodeSelection } from "../../stores/view/selection";
// Shared state-mode kit (state-mode-uniformity ADR): loading is a UI-only Skeleton
// (the human sentence becomes the screen-reader label), and an unavailable interior
// reads as the shared degraded StateBlock — one glyph + one plain sentence, never
// ad-hoc text or a bespoke shape.
import { Skeleton, SkeletonRow, StateBlock } from "../kit";
import {
  deriveNodeInteriorView,
  interiorSteps,
  stateMarkKey,
} from "../../stores/view/nodeInterior";

// --- the interior component --------------------------------------------------------

export function NodeInterior({ id, scope }: { id: string; scope: string | null }) {
  const detail = useNodeDetailView(id, scope);
  const interior = deriveNodeInteriorView(id, detail);
  const selectNode = useDashboardNodeSelection(scope);
  // A feature is a SYNTHESIZED constellation aggregate — the `/nodes/{id}` family
  // 404s it (its detail/neighbors queries are gated off, so `detail` would hang on
  // "unfolding…" forever). Its interior unfolds from the feature-filtered DOCUMENT
  // slice instead — the addressable, bounded, mirror-live path — so route there
  // before the detail gate.
  if (interior.state === "feature") {
    return <FeatureLifecycle id={id} scope={scope} selectNode={selectNode} />;
  }
  if (interior.state === "loading") {
    return (
      <Skeleton label={interior.message} className="mt-fg-1">
        <SkeletonRow width="w-2/3" />
        <SkeletonRow width="w-1/2" />
      </Skeleton>
    );
  }
  // Contained per-island failure (ADR "States"): an interior/detail fetch
  // failure is rendered on THIS island, never as a canvas-wide error. It reads
  // as the shared degraded state block — a glyph + one sentence carries the
  // state without color perception (state-mode-uniformity ADR).
  if (interior.state === "unavailable") {
    return (
      <div className="mt-fg-1" data-interior-error>
        <StateBlock mode="degraded" layout="inline" message={interior.message} />
      </div>
    );
  }
  if (interior.state === "plan")
    return <PlanInterior detail={interior.detail} selectNode={selectNode} />;
  return <NodeSummary node={interior.node} />;
}

/**
 * Feature → its document lifecycle along the canonical axis. Sourced from the
 * feature-filtered DOCUMENT slice (bounded to that feature's members,
 * graph-queries-are-bounded-by-default) rather than `/nodes/{id}/neighbors`,
 * which 404s a synthesized feature aggregate on the live engine. The active scope
 * is resolved the way the chrome resolves it (the in-session pick, else the
 * persisted session) — read from the stores layer directly, never fetched here
 * (dashboard-layer-ownership).
 */
function FeatureLifecycle({
  id,
  scope,
  selectNode,
}: {
  id: string;
  scope: string | null;
  selectNode: (id: string | null) => Promise<boolean>;
}) {
  const lifecycle = useFeatureLifecycleView(id, scope);
  if (lifecycle.state === "loading") {
    return (
      <Skeleton label="unfolding lifecycle…" className="mt-fg-1">
        <SkeletonRow width="w-2/3" />
        <SkeletonRow width="w-1/2" />
      </Skeleton>
    );
  }
  return (
    <ol className="mt-fg-1 flex items-center gap-fg-1" data-lifecycle-axis>
      {lifecycle.docs.map((doc, i) => (
        <li key={doc.id} className="flex items-center gap-fg-1">
          {i > 0 && (
            <span className="text-ink-faint" aria-hidden>
              →
            </span>
          )}
          <button
            type="button"
            onClick={() => void selectNode(doc.id)}
            className="flex items-center gap-fg-1 rounded-fg-xs border border-rule px-fg-1 py-fg-0-5 text-caption text-ink-muted transition-colors duration-ui-fast ease-settle hover:border-rule-strong hover:bg-paper-sunken"
            title={doc.title ?? doc.kind}
          >
            <DocTypeMark kind={doc.kind} size={12} aria-hidden />
            <span className="select-text">{doc.kind}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** Plan → tiered interior with check state (canonical order, never force-laid). */
function PlanInterior({
  detail,
  selectNode,
}: {
  detail: NodeDetail;
  selectNode: (id: string | null) => Promise<boolean>;
}) {
  const steps = interiorSteps(detail.interior);
  const progress = detail.node.lifecycle?.progress;
  return (
    <div className="mt-fg-1" data-plan-interior>
      {progress && (
        <p className="text-caption text-ink-muted">
          {/* Counts are data-bearing → tabular numerals (typography law). */}
          <span data-tabular className="tabular-nums">
            {progress.done}
          </span>
          /
          <span data-tabular className="tabular-nums">
            {progress.total}
          </span>{" "}
          steps done
        </p>
      )}
      <ul className="mt-fg-1 grid grid-cols-4 gap-fg-1">
        {steps.map((step) => (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => void selectNode(step.id)}
              // Done state is carried by a check glyph + fill + border, not hue
              // alone — grayscale-safe (ADR a11y). The accent token reinforces.
              aria-pressed={step.done}
              className={`flex w-full items-center gap-fg-0-5 rounded-fg-xs border px-fg-1 py-fg-0-5 text-caption ${
                step.done
                  ? "border-state-active/40 bg-accent-subtle text-accent-text"
                  : "border-rule text-ink-muted"
              }`}
              title={step.title}
            >
              <span aria-hidden>{step.done ? "✓" : "○"}</span>
              <span className="select-text truncate">{step.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NodeSummary({ node }: { node: EngineNode }) {
  const mark = stateMarkKey(node.lifecycle?.state);
  return (
    <dl className="mt-fg-1 text-caption text-ink-muted">
      <div className="flex items-center gap-fg-1">
        <dt className="inline font-medium">kind:</dt>
        <dd className="inline flex items-center gap-fg-1">
          <DocTypeMark kind={node.kind} size={12} aria-hidden />
          {node.kind}
        </dd>
      </div>
      {node.lifecycle && (
        <div className="flex items-center gap-fg-1">
          <dt className="inline font-medium">state:</dt>
          <dd className="inline flex items-center gap-fg-1">
            {mark && <StateMark state={mark} size={12} aria-hidden />}
            {node.lifecycle.state}
          </dd>
        </div>
      )}
      {/* The node id is true identity → monospace (typography law). */}
      <div className="mt-fg-0-5">
        <dt className="inline font-medium">id:</dt>{" "}
        <dd className="inline break-all font-mono text-ink-faint">{node.id}</dd>
      </div>
    </dl>
  );
}
