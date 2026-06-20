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

import { AlertTriangle, ScanSearch } from "lucide-react";

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
  // The whole graph genuinely failed to load (a query ran and settled with no
  // slice) — the binding "Graph is not available" centered card. DISTINCT from
  // `degraded` (a single tier down while the graph is live).
  | { kind: "unavailable" }
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
  /** The scope a graph query was actually issued for (`graphQuery.scope`), or null
   *  when no query is active yet. Distinguishes "a query ran and returned no slice"
   *  (unavailable) from "no query has started" (still loading / idle). */
  queriedScope: string | null;
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
  const { scope, granularity, stageSurface, slice, queriedScope, availability } =
    inputs;
  // The empty/no-graph invitation dominates: a worktree with no vault corpus is
  // not a void to load but a next step to offer.
  if (stageSurface === "empty-invitation") return { kind: "empty" };
  if (scope === null) return { kind: "awaiting-scope" };
  // No held slice. While the query is in flight (or none has started yet) it is a
  // scope-appropriate loading state; once a query has settled WITHOUT a slice the
  // graph genuinely failed to load → the unavailable card.
  if (!slice) {
    if (availability.loading || queriedScope === null) {
      return granularity === "document"
        ? { kind: "loading-document" }
        : { kind: "loading-constellation" };
    }
    return { kind: "unavailable" };
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

/**
 * The binding centered state card (graph/Hero state variants 713:2116/2296/2475 —
 * `LoadingState`/`DegradedState`/`EmptyState` 498:987–993): a raised paper card,
 * `border/subtle`, rounded 10px, 26×22 interior, centered in the canvas. Pointer-
 * transparent so it never steals the canvas pointer, and it never blanks the field
 * — the legend / nav / minimap overlays stay live around it.
 */
function StateCard({
  children,
  testid,
}: {
  children: React.ReactNode;
  testid: string;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center px-fg-4"
      data-canvas-state={testid}
      role="status"
    >
      <div className="flex flex-col items-center justify-center gap-[0.625rem] rounded-[0.625rem] border border-rule bg-paper-raised px-[1.625rem] py-[1.375rem] text-center">
        {children}
      </div>
    </div>
  );
}

/** The three binding skeleton bars (498:989–991): `border/subtle` fill, 10px tall,
 *  4px radius, 200 / 150 / 220px wide. Pulse only when motion is allowed. */
function LoadingSkeleton() {
  return (
    <>
      <span className="h-[0.625rem] w-[12.5rem] rounded-[0.25rem] bg-rule motion-safe:animate-pulse" />
      <span className="h-[0.625rem] w-[9.375rem] rounded-[0.25rem] bg-rule motion-safe:animate-pulse" />
      <span className="h-[0.625rem] w-[13.75rem] rounded-[0.25rem] bg-rule motion-safe:animate-pulse" />
    </>
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
      className={`pointer-events-none absolute inset-x-0 bottom-fg-3 flex justify-center px-fg-4 ${
        tone === "warn" ? "text-state-stale" : "text-ink-muted"
      }`}
      data-canvas-state={testid}
      role="status"
    >
      <div className="pointer-events-auto flex items-center gap-fg-2 rounded-fg-md border border-rule bg-paper-raised/95 px-fg-3 py-fg-1-5 text-label shadow-fg-overlay">
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
    // Loading (binding LoadingState 498:987): "Loading..." in faint ink over three
    // skeleton bars. The awaiting-scope and both granularity loads share the one
    // binding loading card.
    case "awaiting-scope":
    case "loading-constellation":
    case "loading-document":
      return (
        <StateCard testid={state.kind}>
          <p className="text-body font-medium text-ink-faint">Loading...</p>
          <LoadingSkeleton />
        </StateCard>
      );
    // Empty (binding EmptyState): the no-results message in muted ink.
    case "empty":
      return (
        <StateCard testid="empty">
          <p className="text-body text-ink-muted">No nodes match the current filter</p>
        </StateCard>
      );
    // Unavailable (binding DegradedState 498:992): the graph genuinely failed to
    // load — "Graph is not available" in the stale/caution accent, read by shape +
    // the amber token (never colour alone).
    case "unavailable":
      return (
        <StateCard testid="unavailable">
          <p className="text-body font-medium text-state-stale">
            Graph is not available
          </p>
        </StateCard>
      );
    // Degraded — a single tier is down while the graph is LIVE behind it. A
    // non-blocking corner banner naming the tier (never the blocking centered card,
    // which would occlude a working graph); the field stays fully interactive.
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
