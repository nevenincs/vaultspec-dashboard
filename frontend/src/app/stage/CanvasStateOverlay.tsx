// The canvas's designed-state overlay (W02.P09.S25, node-canvas ADR "States").
//
// The node-canvas ADR requires every wire condition to render as a DESIGNED
// state, never a raw error: loading (scope-appropriate), the empty/no-graph
// invitation, per-tier degradation (honestly-absent tier), a truncated bounded
// query ("narrowed — refine your view"), and an unknown-tier data error. This
// is the chrome layer's half of that mandate — a dumb projection over stores-
// derived truth. It NEVER fetches and NEVER reads the raw `tiers` block: the
// per-tier degradation arrives pre-derived through `useGraphSliceAvailability`,
// the empty/stale conditions through the degradation matrix's surface state, and
// the truncation/unknown-tier facts off the held slice the stores own
// (dashboard-layer-ownership, views-are-projections-of-one-model).
//
// The resolver below is a pure function from those inputs to one state, so the
// ADR's state table is unit-testable without a DOM or a live backend.

import { AlertTriangle, Brain, ScanSearch } from "lucide-react";

import type { GraphSlice } from "../../stores/server/engine";
import type { GraphSliceAvailability } from "../../stores/server/queries";
import type { SurfaceStates } from "../degradation/matrix";

/** The four provenance tiers, in canonical order — the only legal tier names. */
const KNOWN_TIERS = new Set(["declared", "structural", "temporal", "semantic"]);

/**
 * The canvas's resolved chrome state. The renderer keeps drawing the held slice
 * underneath every state except `empty`/`awaiting-scope`/`loading-*`; the
 * `degraded` and `truncated` states are non-blocking annotations over a live
 * field (the ADR's "render the capped subgraph plus an honest affordance" and
 * "renders the affected tier as honestly-absent, never as a failure of the whole
 * canvas").
 */
export type CanvasState =
  | { kind: "ok" }
  | { kind: "awaiting-scope" }
  | { kind: "loading-constellation" }
  | { kind: "loading-document" }
  | { kind: "empty" }
  | { kind: "degraded"; tiers: string[]; reasons: Record<string, string> }
  | { kind: "truncated"; total: number; returned: number; reason: string }
  | { kind: "unknown-tier"; tiers: string[] };

export interface CanvasStateInputs {
  /** Null until a worktree scope is resolved (cold start / no vault-bearing wt). */
  scope: string | null;
  /** "feature" = constellation overview; "document" = the scoped graph. */
  granularity: "document" | "feature";
  /** The degradation matrix's stage cell (empty-invitation dominates). */
  stageSurface: SurfaceStates["stage"];
  /** The held slice, or null while the first keyframe is in flight. */
  slice: GraphSlice | null;
  /** Pre-derived per-tier availability (never the raw `tiers` block). */
  availability: GraphSliceAvailability;
}

/**
 * Resolve the one canvas state from stores-derived truth. Precedence mirrors the
 * ADR "States" prose: the corpus-absent invitation dominates; a scope not yet
 * resolved is "awaiting scope"; an in-flight first keyframe is a scope-appropriate
 * loading state; an unknown tier on the wire is a SURFACED data error (never
 * silently re-bucketed); a fired node ceiling is the truncated affordance; an
 * honestly-absent tier is non-blocking degradation; otherwise the field is ok.
 */
export function resolveCanvasState(inputs: CanvasStateInputs): CanvasState {
  const { scope, granularity, stageSurface, slice, availability } = inputs;
  // The empty/no-graph invitation dominates: a worktree with no vault corpus is
  // not a void to load but a next step to offer.
  if (stageSurface === "empty-invitation") return { kind: "empty" };
  if (scope === null) return { kind: "awaiting-scope" };
  // No held keyframe yet → scope-appropriate loading copy.
  if (!slice) {
    return granularity === "document"
      ? { kind: "loading-document" }
      : { kind: "loading-constellation" };
  }
  // An unknown tier on the wire is a data error, not a silent re-bucket: any
  // degraded-tier name outside the four canonical tiers surfaces here.
  const unknown = availability.degradedTiers.filter((t) => !KNOWN_TIERS.has(t));
  if (unknown.length > 0) return { kind: "unknown-tier", tiers: unknown };
  // A fired node ceiling: render the capped subgraph plus the refine affordance.
  if (slice.truncated) {
    return {
      kind: "truncated",
      total: slice.truncated.total_nodes,
      returned: slice.truncated.returned_nodes,
      reason: slice.truncated.reason,
    };
  }
  // An honestly-absent tier: non-blocking annotation over the live field.
  if (availability.degraded) {
    return {
      kind: "degraded",
      tiers: availability.degradedTiers,
      reasons: availability.reasons,
    };
  }
  return { kind: "ok" };
}

/** A centered, pointer-transparent overlay shell — never steals canvas pointer. */
function CenteredNotice({
  children,
  testid,
}: {
  children: React.ReactNode;
  testid: string;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-vs-2 px-vs-4 text-center"
      data-canvas-state={testid}
      role="status"
    >
      {children}
    </div>
  );
}

/** A non-blocking bottom-anchored banner — the field stays live behind it. */
function CornerBanner({
  children,
  testid,
  tone = "muted",
}: {
  children: React.ReactNode;
  testid: string;
  tone?: "muted" | "warn";
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-vs-3 flex justify-center px-vs-4 ${
        tone === "warn" ? "text-state-stale" : "text-ink-muted"
      }`}
      data-canvas-state={testid}
      role="status"
    >
      <div className="pointer-events-auto flex items-center gap-vs-2 rounded-vs-md border border-rule bg-paper-raised/95 px-vs-3 py-vs-1-5 text-label shadow-float">
        {children}
      </div>
    </div>
  );
}

/**
 * The chrome-layer realization of every canvas wire state. Dumb projection: the
 * resolved `state` is the only input it renders. Loading/empty states center;
 * degraded/truncated/unknown-tier annotate the live field from a corner so the
 * canvas underneath is never blanked.
 */
export function CanvasStateOverlay({ state }: { state: CanvasState }) {
  switch (state.kind) {
    case "ok":
      return null;
    case "awaiting-scope":
      return (
        <CenteredNotice testid="awaiting-scope">
          <p className="text-body text-ink-faint">waiting for a worktree scope…</p>
        </CenteredNotice>
      );
    case "loading-constellation":
      return (
        <CenteredNotice testid="loading-constellation">
          <p className="text-body text-ink-faint">loading the constellation…</p>
        </CenteredNotice>
      );
    case "loading-document":
      return (
        <CenteredNotice testid="loading-document">
          <p className="text-body text-ink-faint">loading the document graph…</p>
        </CenteredNotice>
      );
    case "empty":
      return (
        <CenteredNotice testid="empty">
          <Brain aria-hidden className="text-ink-faint" size={40} strokeWidth={1.25} />
          <p className="text-body text-ink-muted">
            this worktree has no second brain yet
          </p>
          <p className="text-label text-ink-faint">
            run <code className="font-mono">vaultspec-core install</code> to start a
            vault here
          </p>
        </CenteredNotice>
      );
    case "degraded":
      return (
        <CornerBanner testid="degraded" tone="muted">
          <span>
            {tierList(state.tiers)} tier{state.tiers.length > 1 ? "s" : ""} unavailable
            — the rest of the graph is live
          </span>
        </CornerBanner>
      );
    case "truncated":
      return (
        <CornerBanner testid="truncated" tone="warn">
          <ScanSearch aria-hidden size={16} strokeWidth={1.5} />
          <span>
            narrowed to{" "}
            <span data-tabular className="tabular-nums">
              {state.returned}
            </span>{" "}
            of{" "}
            <span data-tabular className="tabular-nums">
              {state.total}
            </span>{" "}
            nodes — refine your view with a filter
          </span>
        </CornerBanner>
      );
    case "unknown-tier":
      return (
        <CornerBanner testid="unknown-tier" tone="warn">
          <AlertTriangle aria-hidden size={16} strokeWidth={1.5} />
          <span>
            unrecognized tier on the wire: {tierList(state.tiers)} — this is a data
            error, not a degraded view
          </span>
        </CornerBanner>
      );
  }
}

/** Join tier names with a comma, lowercased, for the non-color state copy. */
function tierList(tiers: string[]): string {
  return tiers.join(", ");
}
