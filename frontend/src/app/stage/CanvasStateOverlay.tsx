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

import { ScanSearch } from "lucide-react";

import { Folder, Skeleton, SkeletonBar, TriangleAlert } from "../kit";
import type { GraphSlice } from "../../stores/server/engine";
import type { GraphSliceAvailability } from "../../stores/server/queries";
import type { RenderCapability } from "../../stores/view/renderCapability";
import type { SurfaceStates } from "../degradation/matrix";

/** The three provenance EDGE tiers — the only legal graph-edge tier names. The
 *  engine never mints a semantic graph edge (ADR D3.5), so `semantic` is NOT a
 *  graph-edge tier; semantic-search degradation is search's concern, surfaced in
 *  the search UI, never on the graph stage. */
const KNOWN_TIERS = new Set(["declared", "structural", "temporal"]);

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
  | { kind: "unknown-tier"; tiers: string[] }
  // The canvas cannot render: a lost WebGL context (transient — the scene is
  // restoring) or no hardware graphics at all (hard). A blocking centered card —
  // nothing can render underneath, so unlike the degraded banner it is not over a
  // live field.
  | { kind: "gpu-unavailable" }
  | { kind: "context-lost" };

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
  /** The scene's reported WebGL render-capability (render-capability SceneEvent). */
  renderCapability: RenderCapability;
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
  const {
    scope,
    granularity,
    stageSurface,
    slice,
    queriedScope,
    availability,
    renderCapability,
  } = inputs;
  // The empty/no-graph invitation dominates: a worktree with no vault corpus is
  // not a void to load but a next step to offer.
  if (stageSurface === "empty-invitation") return { kind: "empty" };
  if (scope === null) return { kind: "awaiting-scope" };
  // Render-capability (after scope, before data states): if the canvas cannot render
  // — no hardware graphics, or a lost WebGL context being restored — the data states
  // are moot. `ok` (including the software-fallback, which still renders) falls
  // through to the normal data flow.
  if (renderCapability.status === "unavailable") return { kind: "gpu-unavailable" };
  if (renderCapability.status === "context-lost") return { kind: "context-lost" };
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
  // The graph stage surfaces only EDGE-tier degradation. `semantic` is not a
  // graph-edge tier (the engine never mints semantic graph edges, ADR D3.5) —
  // semantic-search availability is search's concern, surfaced in the search UI,
  // so it is dropped here before any graph-stage degradation is announced.
  const edgeDegradedTiers = availability.degradedTiers.filter((t) => t !== "semantic");
  // An unknown tier on the wire is a data error, not a silent re-bucket: any
  // degraded edge-tier name outside the three canonical edge tiers surfaces here.
  const unknown = edgeDegradedTiers.filter((t) => !KNOWN_TIERS.has(t));
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
  // An honestly-absent EDGE tier: non-blocking annotation over the live field.
  // Gated on the edge-tier subset so a semantic-search-only degradation never
  // banners the graph stage.
  if (edgeDegradedTiers.length > 0) {
    return {
      kind: "degraded",
      tiers: edgeDegradedTiers,
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
// Exported so a sibling designed state OUTSIDE this pure resolver's own union
// (the not-managed provisioning panel, `ProvisionPanel.tsx` — which fetches
// and mutates, so it cannot live in this no-fetch resolver) still composes the
// SAME card primitive rather than a bespoke look-alike (design-system-is-
// centralized). `interactive` re-enables pointer events on the card only
// (every other state stays click-through, unchanged) for the one caller that
// carries a real affordance (a provision button) rather than static copy.
export function StateCard({
  children,
  testid,
  interactive = false,
}: {
  children: React.ReactNode;
  testid: string;
  interactive?: boolean;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center px-fg-4"
      data-canvas-state={testid}
      role="status"
    >
      <div
        className={`flex flex-col items-center justify-center gap-[0.625rem] rounded-[0.625rem] border border-rule bg-paper-raised px-[1.625rem] py-[1.375rem] text-center ${interactive ? "pointer-events-auto" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}

/** The three binding skeleton bars (498:989–991), composed from the shared kit
 *  `Skeleton` (state-mode-uniformity ADR: loading is UI-ONLY, no on-screen text — the
 *  human `label` lives in the wrapper's `sr-only`). Widths mirror the binding 200 / 150
 *  / 220px bars; the kit pulses + announces busy state. */
function LoadingSkeleton({ label }: { label: string }) {
  return (
    <Skeleton label={label} className="items-center">
      <SkeletonBar width="w-[12.5rem]" height="h-[0.625rem]" />
      <SkeletonBar width="w-[9.375rem]" height="h-[0.625rem]" />
      <SkeletonBar width="w-[13.75rem]" height="h-[0.625rem]" />
    </Skeleton>
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
    // Loading (binding LoadingState 498:987): UI-ONLY — three skeleton bars, NO
    // on-screen "Loading…" text (state-mode-uniformity ADR: the human label lives in
    // the kit `Skeleton`'s sr-only). The awaiting-scope and both granularity loads
    // share the one binding loading card.
    case "awaiting-scope":
    case "loading-constellation":
    case "loading-document":
      return (
        <StateCard testid={state.kind}>
          <LoadingSkeleton label="Loading graph" />
        </StateCard>
      );
    // Empty (binding EmptyState): the shared empty glyph (matching the kit `StateBlock`
    // empty mode — `Folder` in `ink-faint`) over one plain no-results sentence.
    case "empty":
      return (
        <StateCard testid="empty">
          <Folder aria-hidden size={20} className="shrink-0 text-ink-faint" />
          <p className="text-body text-ink-muted">No nodes match the current filter</p>
        </StateCard>
      );
    // Unavailable (binding DegradedState 498:992): the graph genuinely failed to load.
    // The shared caution mark (`TriangleAlert`, the same glyph the kit `StateBlock`
    // degraded mode carries) in the `state-stale` tone over one sentence — read by
    // shape + the amber token, never colour alone.
    case "unavailable":
      return (
        <StateCard testid="unavailable">
          <TriangleAlert aria-hidden size={20} className="shrink-0 text-state-stale" />
          <p className="text-body font-medium text-state-stale">
            Graph is not available
          </p>
        </StateCard>
      );
    // Render-capability (G1): the canvas itself cannot render. Plain language, no
    // WebGL jargon (ui-labels-are-user-facing). Blocking centered cards — nothing
    // renders underneath, unlike the degraded banner over a live field.
    case "gpu-unavailable":
      return (
        <StateCard testid="gpu-unavailable">
          <p className="text-body font-medium text-state-stale">Graphics unavailable</p>
          <p className="text-label text-ink-muted">
            This view needs hardware graphics to render.
          </p>
        </StateCard>
      );
    case "context-lost":
      return (
        <StateCard testid="context-lost">
          <p className="text-body font-medium text-ink-faint">Restoring graphics…</p>
          <LoadingSkeleton label="Restoring graphics" />
        </StateCard>
      );
    // Degraded — a single tier is down while the graph is LIVE behind it. A
    // non-blocking corner banner naming the tier (never the blocking centered card,
    // which would occlude a working graph); the field stays fully interactive.
    case "degraded":
      return (
        <CornerBanner testid="degraded" tone="muted">
          <span>{degradedBannerCopy(state.tiers, state.reasons)}</span>
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
          <TriangleAlert aria-hidden size={16} strokeWidth={1.5} />
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

/**
 * Plain, user-facing names for each provenance tier (`ui-labels-are-user-facing`):
 * the degraded banner names the affected FEATURE, never the internal tier name.
 * Stored lowercase for mid-sentence use; capitalized at a sentence start.
 */
const TIER_FEATURE_LABEL: Record<string, string> = {
  declared: "links",
  structural: "mentions",
  temporal: "timeline",
};

/**
 * A tier whose reason names a transient index build reads as "loading", not
 * "unavailable". INTERIM heuristic: the reason STRING is the only signal until the
 * engine emits a structured build state — the one match is isolated here so it swaps
 * to that signal cleanly when it lands (graph-tiers follow-up A). */
function isBuildingReason(reason: string | undefined): boolean {
  return reason !== undefined && reason.toLowerCase().includes("building");
}

/** Join feature names as plain prose: "a", "a and b", "a, b and c". */
function featureList(tiers: string[]): string {
  const names = tiers.map((tier) => TIER_FEATURE_LABEL[tier] ?? tier);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function capitalizeFirst(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

/**
 * The degraded-banner copy (`ui-labels-are-user-facing`): plain language naming the
 * affected feature, splitting tiers whose reason is a transient build ("Still
 * loading …") from genuinely-down tiers ("… unavailable — the rest of the graph is
 * live"). Pure + exported for unit tests.
 */
export function degradedBannerCopy(
  tiers: string[],
  reasons: Record<string, string>,
): string {
  const building = tiers.filter((tier) => isBuildingReason(reasons[tier]));
  const down = tiers.filter((tier) => !isBuildingReason(reasons[tier]));
  const live = " — the rest of the graph is live";
  if (building.length > 0 && down.length > 0) {
    return `Still loading ${featureList(building)}; ${featureList(down)} unavailable${live}`;
  }
  if (building.length > 0) {
    return `Still loading ${featureList(building)}…`;
  }
  return `${capitalizeFirst(featureList(down))} unavailable${live}`;
}
