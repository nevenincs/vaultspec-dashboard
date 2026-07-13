// The canvas's designed-state overlay (node-canvas ADR "States"; declared-edge-
// continuity + canvas-overlay-redesign).
//
// Every wire condition renders as a DESIGNED state, never a raw error. The overlay
// splits into ONE PRIMARY state — a blocking/centered treatment when nothing can render
// underneath (loading, empty, unavailable, no-GPU, restoring) — plus a set of
// non-blocking ANNOTATIONS that co-occur over a LIVE field (a degraded tier, the
// document-links building/refreshing state, a fired node ceiling, a background
// re-query). Loading vs building vs refreshing vs truncated can be true at once, so the
// resolver returns the primary AND every active annotation in a deliberate priority
// order (encoded here, unit-tested), and the chrome stacks them so each stays legible.
//
// Layer law: this is a dumb projection over stores-derived truth. It NEVER fetches and
// NEVER reads the raw `tiers` block — per-tier availability arrives pre-derived through
// `useGraphSliceAvailability`, the stage surface through the degradation matrix, and the
// truncation/reason facts off the held slice the stores own (dashboard-layer-ownership).
// The one intent it emits is INVOKING the existing open-filter affordance from the
// truncation chip (the left rail owns filter authorship — the chip only opens it).

import { ScanSearch } from "lucide-react";

import { Button, Folder, Spinner, TriangleAlert } from "../kit";
import { setFilterSidebarOpen } from "../../stores/view/filterSidebar";
import type { GraphSlice } from "../../stores/server/engine";
import type { GraphSliceAvailability } from "../../stores/server/queries";
import type { RenderCapability } from "../../stores/view/renderCapability";
import type { SurfaceStates } from "../degradation/matrix";

/** The three provenance EDGE tiers — the only legal graph-edge tier names. The engine
 *  never mints a semantic graph edge (ADR D3.5), so `semantic` is NOT a graph-edge tier;
 *  semantic-search degradation is search's concern, never the graph stage. */
const KNOWN_TIERS = new Set(["declared", "structural", "temporal"]);

/**
 * The ONE blocking/centered canvas state. Mutually exclusive: nothing renders
 * underneath these (no slice, or the canvas itself cannot paint), so exactly one shows,
 * centered. `ok` means the field is live — any annotations then ride over it.
 */
export type CanvasPrimary =
  | { kind: "ok" }
  | { kind: "awaiting-scope" }
  | { kind: "loading-constellation" }
  | { kind: "loading-document" }
  | { kind: "empty" }
  // The whole graph genuinely failed to load (a query ran and settled with no slice).
  | { kind: "unavailable" }
  // The canvas cannot render: no hardware graphics (hard) or a lost WebGL context
  // being restored (transient). Blocking — nothing renders underneath.
  | { kind: "gpu-unavailable" }
  | { kind: "context-lost" };

/**
 * A non-blocking annotation over a LIVE field. Several co-occur (a truncated slice
 * whose links are refreshing while a tier is degraded), so these are a SET, rendered as
 * a stacked corner rail, each legible.
 */
export type CanvasAnnotation =
  // An unknown edge-tier name on the wire — a data error, surfaced not silently dropped.
  | { kind: "unknown-tier"; tiers: string[] }
  // An honestly-absent edge tier (structural/temporal, or declared genuinely down).
  | { kind: "degraded"; tiers: string[]; reasons: Record<string, string> }
  // Document links (declared tier) loading for the FIRST time — nodes shown, no edges
  // yet (declared-edge-continuity ADR: `DECLARED_BUILDING`).
  | { kind: "links-building" }
  // Document links being refreshed while the PRIOR (carried) edges stay visible
  // (`DECLARED_REFRESHING`) — the quiet, unobtrusive state.
  | { kind: "links-refreshing" }
  // A fired node ceiling: the capped subgraph renders + an actionable refine chip.
  | { kind: "truncated"; total: number; returned: number; reason: string }
  // A re-query in flight behind the held slice (`keepPreviousData`) — lowest priority.
  | { kind: "refreshing" };

/**
 * The resolved overlay: one primary + the ordered set of active annotations. The
 * annotation order IS the stacking priority (most important first), so the chrome can
 * render them top-down without re-deciding precedence.
 */
export interface CanvasOverlayView {
  primary: CanvasPrimary;
  annotations: CanvasAnnotation[];
}

/** Back-compat alias for the harness + call sites that hold the resolved view. */
export type CanvasState = CanvasOverlayView;

export interface CanvasStateInputs {
  /** Null until a worktree scope is resolved (cold start / no vault-bearing wt). */
  scope: string | null;
  /** "feature" = constellation overview; "document" = the scoped graph. */
  granularity: "document" | "feature";
  /** The degradation matrix's stage cell (empty-invitation dominates). */
  stageSurface: SurfaceStates["stage"];
  /** The held slice, or null while the first keyframe is in flight. */
  slice: GraphSlice | null;
  /** The scope a graph query was actually issued for, or null when none is active yet.
   *  Distinguishes "a query ran and returned no slice" (unavailable) from "no query has
   *  started" (still loading / idle). */
  queriedScope: string | null;
  /** Pre-derived per-tier availability (never the raw `tiers` block). */
  availability: GraphSliceAvailability;
  /** The scene's reported WebGL render-capability (render-capability SceneEvent). */
  renderCapability: RenderCapability;
}

/** The blocking/centered decision (ADR "States" precedence): corpus-absent invitation
 *  dominates; then an unresolved scope; then render-capability; then the no-slice
 *  loading/unavailable split. `ok` when a slice is live. */
function resolvePrimary(inputs: CanvasStateInputs): CanvasPrimary {
  const {
    scope,
    granularity,
    stageSurface,
    slice,
    queriedScope,
    availability,
    renderCapability,
  } = inputs;
  if (stageSurface === "empty-invitation") return { kind: "empty" };
  if (scope === null) return { kind: "awaiting-scope" };
  if (renderCapability.status === "unavailable") return { kind: "gpu-unavailable" };
  if (renderCapability.status === "context-lost") return { kind: "context-lost" };
  if (!slice) {
    if (availability.loading || queriedScope === null) {
      return granularity === "document"
        ? { kind: "loading-document" }
        : { kind: "loading-constellation" };
    }
    return { kind: "unavailable" };
  }
  return { kind: "ok" };
}

/**
 * The active annotations over a LIVE field, in priority (stacking) order:
 * unknown-tier › degraded › links-building › truncated › links-refreshing › refreshing.
 * The declared tier's building/refreshing reason is SPLIT OUT of the generic degraded
 * set into the dedicated document-links states (declared-edge-continuity ADR); a
 * declared tier that is genuinely down (a non-building/refreshing reason) stays in the
 * generic degraded annotation.
 */
function resolveAnnotations(inputs: CanvasStateInputs): CanvasAnnotation[] {
  const { slice, availability } = inputs;
  const annotations: CanvasAnnotation[] = [];
  // `semantic` is not a graph-edge tier (ADR D3.5) — dropped before any graph-stage
  // degradation is announced.
  const edgeDegradedTiers = availability.degradedTiers.filter((t) => t !== "semantic");
  const unknown = edgeDegradedTiers.filter((t) => !KNOWN_TIERS.has(t));
  if (unknown.length > 0) annotations.push({ kind: "unknown-tier", tiers: unknown });

  // Split the declared tier's building/refreshing out of the generic degraded set.
  const declaredReason = availability.reasons.declared;
  const declaredDegraded = edgeDegradedTiers.includes("declared");
  const linksBuilding = declaredDegraded && isBuildingReason(declaredReason);
  const linksRefreshing = declaredDegraded && isRefreshingReason(declaredReason);

  const genericDegraded = edgeDegradedTiers.filter(
    (t) =>
      KNOWN_TIERS.has(t) && !(t === "declared" && (linksBuilding || linksRefreshing)),
  );
  if (genericDegraded.length > 0) {
    annotations.push({
      kind: "degraded",
      tiers: genericDegraded,
      reasons: availability.reasons,
    });
  }
  if (linksBuilding) annotations.push({ kind: "links-building" });
  if (slice?.truncated) {
    annotations.push({
      kind: "truncated",
      total: slice.truncated.total_nodes,
      returned: slice.truncated.returned_nodes,
      reason: slice.truncated.reason,
    });
  }
  if (linksRefreshing) annotations.push({ kind: "links-refreshing" });
  if (availability.refreshing) annotations.push({ kind: "refreshing" });
  return annotations;
}

/**
 * Resolve the canvas overlay from stores-derived truth: one primary state plus every
 * co-occurring annotation. Annotations only ride a LIVE field, so they are computed
 * only when the primary is `ok` (a blocking state occludes the field anyway).
 */
export function resolveCanvasState(inputs: CanvasStateInputs): CanvasOverlayView {
  const primary = resolvePrimary(inputs);
  return {
    primary,
    annotations: primary.kind === "ok" ? resolveAnnotations(inputs) : [],
  };
}

/**
 * The binding centered state card: a raised paper card, centered in the canvas,
 * pointer-transparent so it never steals the canvas pointer. Exported so a sibling
 * designed state OUTSIDE this resolver (the provisioning panel) composes the SAME card
 * primitive. `interactive` re-enables pointer events for the one caller with a real
 * affordance.
 */
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

/** The GLOBAL canvas loader (canvas-overlay-redesign): one centered spinner ring on an
 *  attenuated scrim, matching the app's boot-loader idiom (kit `Spinner`, reduced-motion
 *  safe). No on-screen text — the human label lives in the spinner's `role="status"`
 *  sr-only (state-mode-uniformity ADR D2). */
function CenteredLoader({ testid, label }: { testid: string; label: string }) {
  return (
    // No role="status" on the wrapper: the kit Spinner carries its own status
    // live region — nesting two would double-announce (review LOW).
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center bg-paper/70"
      data-canvas-state={testid}
    >
      <Spinner label={label} />
    </div>
  );
}

/** The bottom rail that stacks co-occurring annotations. All four canvas corners are
 *  occupied by existing widgets (zoom bottom-left, sim top-left, settings top-right,
 *  minimap bottom-right), so the rail pins to the bottom EDGE (out of the center
 *  eye-line, never over graph content permanently) and grows upward, most-important
 *  chip nearest the edge. Pointer-transparent except each chip's own affordance. */
function AnnotationRail({ annotations }: { annotations: CanvasAnnotation[] }) {
  if (annotations.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-fg-3 flex flex-col-reverse items-center gap-fg-1-5 px-fg-4">
      {annotations.map((annotation) => (
        <AnnotationChip key={annotation.kind} annotation={annotation} />
      ))}
    </div>
  );
}

/** A compact, tokenized overlay chip — the bespoke canvas-annotation composite (the
 *  design system permits bespoke graph/timeline composites over the standard atoms). */
function OverlayChip({
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
      className={`pointer-events-auto flex max-w-[90vw] items-center gap-fg-2 rounded-fg-md border border-rule bg-paper-raised/95 px-fg-3 py-fg-1-5 text-label shadow-fg-overlay ${
        tone === "warn" ? "text-state-stale" : "text-ink-muted"
      }`}
      data-canvas-state={testid}
      role="status"
    >
      {children}
    </div>
  );
}

/** The quietest annotation: a small attenuated caption, no border/shadow — for the
 *  unobtrusive states (links refreshing, background re-query) that must not draw the
 *  eye while the field stays fully usable. */
function QuietCaption({
  children,
  testid,
}: {
  children: React.ReactNode;
  testid: string;
}) {
  return (
    <div
      className="pointer-events-none rounded-fg-sm bg-paper-raised/85 px-fg-2 py-fg-0-5 text-caption text-ink-faint"
      data-canvas-state={testid}
      role="status"
    >
      {children}
    </div>
  );
}

/** One annotation → its chip. */
function AnnotationChip({ annotation }: { annotation: CanvasAnnotation }) {
  switch (annotation.kind) {
    case "unknown-tier":
      return (
        <OverlayChip testid="unknown-tier" tone="warn">
          <TriangleAlert aria-hidden size={16} strokeWidth={1.5} />
          <span>
            unrecognized tier on the wire: {annotation.tiers.join(", ")} — this is a
            data error, not a degraded view
          </span>
        </OverlayChip>
      );
    case "degraded":
      return (
        <OverlayChip testid="degraded" tone="muted">
          <span>{degradedBannerCopy(annotation.tiers, annotation.reasons)}</span>
        </OverlayChip>
      );
    // Document links loading for the first time — nodes render, edges are not in yet.
    case "links-building":
      return (
        <OverlayChip testid="links-building" tone="muted">
          <span>
            Document links are loading for the first time — nodes are shown; links
            appear when they’re ready.
          </span>
        </OverlayChip>
      );
    // A fired node ceiling: an attenuated, ACTIONABLE chip near the periphery — counts in
    // tabular numerals + an affordance that opens the filter plane (the left rail owns
    // filter authorship; this only INVOKES the open affordance).
    case "truncated":
      return (
        <OverlayChip testid="truncated" tone="warn">
          <ScanSearch aria-hidden size={16} strokeWidth={1.5} />
          <span>
            Showing{" "}
            <span data-tabular className="tabular-nums">
              {annotation.returned.toLocaleString("en-US")}
            </span>{" "}
            of{" "}
            <span data-tabular className="tabular-nums">
              {annotation.total.toLocaleString("en-US")}
            </span>{" "}
            nodes
          </span>
          <Button variant="ghost" onClick={() => setFilterSidebarOpen(true)}>
            Refine with a filter
          </Button>
        </OverlayChip>
      );
    // The quiet states: attenuated captions, never banners.
    case "links-refreshing":
      return (
        <QuietCaption testid="links-refreshing">
          Document links are being refreshed.
        </QuietCaption>
      );
    case "refreshing":
      return <QuietCaption testid="refreshing">Refreshing view…</QuietCaption>;
  }
}

/**
 * The chrome-layer realization of the resolved overlay: the one primary state centered,
 * plus the annotation rail over the live field. Dumb projection — the resolved `state`
 * is the only input. Loading/empty/unavailable/gpu/restoring center and (except while a
 * held field is present) occlude; annotations stack at the bottom edge so the canvas is
 * never blanked by them.
 */
export function CanvasStateOverlay({ state }: { state: CanvasOverlayView }) {
  return (
    <>
      <PrimaryCard primary={state.primary} />
      <AnnotationRail annotations={state.annotations} />
    </>
  );
}

function PrimaryCard({ primary }: { primary: CanvasPrimary }) {
  switch (primary.kind) {
    case "ok":
      return null;
    // The global loader: a centered spinner ring on an attenuated scrim (no text).
    case "awaiting-scope":
    case "loading-constellation":
    case "loading-document":
      return <CenteredLoader testid={primary.kind} label="Loading graph" />;
    case "empty":
      return (
        <StateCard testid="empty">
          <Folder aria-hidden size={20} className="shrink-0 text-ink-faint" />
          <p className="text-body text-ink-muted">No nodes match the current filter</p>
        </StateCard>
      );
    case "unavailable":
      return (
        <StateCard testid="unavailable">
          <TriangleAlert aria-hidden size={20} className="shrink-0 text-state-stale" />
          <p className="text-body font-medium text-state-stale">
            Graph is not available
          </p>
        </StateCard>
      );
    // Render-capability: plain language, no WebGL jargon (labels-are-user-facing).
    case "gpu-unavailable":
      return (
        <StateCard testid="gpu-unavailable">
          <p className="text-body font-medium text-state-stale">Graphics unavailable</p>
          <p className="text-label text-ink-muted">
            This view needs hardware graphics to render.
          </p>
        </StateCard>
      );
    // Restoring a lost context: the same centered spinner idiom with a brief label.
    case "context-lost":
      return (
        <StateCard testid="context-lost">
          <Spinner label="Restoring graphics" />
          <p className="text-label text-ink-faint">Restoring graphics…</p>
        </StateCard>
      );
  }
}

/**
 * Plain, user-facing names for each provenance tier (labels-are-user-facing): the
 * degraded copy names the affected FEATURE, never the internal tier name.
 */
const TIER_FEATURE_LABEL: Record<string, string> = {
  declared: "links",
  structural: "mentions",
  temporal: "timeline",
};

/** A tier whose reason names a transient index build reads as "loading", not
 *  "unavailable". The reason STRING is the signal the engine serves (`DECLARED_BUILDING`
 *  = "declared tier building"). */
function isBuildingReason(reason: string | undefined): boolean {
  return reason !== undefined && reason.toLowerCase().includes("building");
}

/** A tier whose reason names a stale-while-refolding carry (`DECLARED_REFRESHING` =
 *  "declared tier refreshing", declared-edge-continuity ADR): the prior edges are still
 *  served while the fold recomputes them. */
function isRefreshingReason(reason: string | undefined): boolean {
  return reason !== undefined && reason.toLowerCase().includes("refreshing");
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
 * The degraded-annotation copy (labels-are-user-facing): plain language naming the
 * affected feature, splitting tiers whose reason is a transient build ("Still loading
 * …") from genuinely-down tiers ("… unavailable — the rest of the graph is live"). Pure
 * + exported for unit tests. (The declared tier's building/refreshing is handled by the
 * dedicated links states, so this copy covers structural/temporal and a genuinely-down
 * declared tier.)
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
