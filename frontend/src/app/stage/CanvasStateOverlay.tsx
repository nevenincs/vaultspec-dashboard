import { ScanSearch } from "lucide-react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import { Button, Spinner, TriangleAlert } from "../kit";
import { setFilterSidebarOpen } from "../../stores/view/filterSidebar";
import type { GraphSlice } from "../../stores/server/engine";
import {
  isTierBuildingReason,
  isTierRefreshingReason,
  type GraphSliceAvailability,
} from "../../stores/server/queries";
import type { RenderCapability } from "../../stores/view/renderCapability";
import type { SurfaceStates } from "../degradation/matrix";

const descriptor = <Key extends MessageDescriptor["key"]>(
  key: Key,
): MessageDescriptor<Key> => Object.freeze({ key });

export const CANVAS_STATE_MESSAGES = Object.freeze({
  openFilters: descriptor("common:actions.openFilters"),
  loading: descriptor("graph:canvas.states.loading"),
  noFilterMatches: descriptor("graph:canvas.emptyStates.noFilterMatches"),
  unavailable: descriptor("graph:canvas.errors.unavailable"),
  partialUnavailable: descriptor("graph:canvas.errors.partialUnavailable"),
  graphicsTitle: descriptor("graph:canvas.errors.graphicsTitle"),
  graphicsMessage: descriptor("graph:canvas.errors.graphicsMessage"),
  restoring: descriptor("graph:canvas.states.restoring"),
  loadingDetails: descriptor("graph:canvas.states.loadingDetails"),
  loadingDocumentLinks: descriptor("graph:canvas.states.loadingDocumentLinks"),
  truncated: descriptor("graph:canvas.states.truncated"),
  refreshingDocumentLinks: descriptor("graph:canvas.states.refreshingDocumentLinks"),
  refreshing: descriptor("graph:canvas.states.refreshing"),
});

type ResolveMessage = ReturnType<typeof useLocalizedMessageResolver>;

const KNOWN_TIERS = new Set(["declared", "structural", "temporal"]);

/** Exactly one blocking state is active. An `ok` field may carry annotations. */
export type CanvasPrimary =
  | { kind: "ok" }
  | { kind: "awaiting-scope" }
  | { kind: "loading-constellation" }
  | { kind: "loading-document" }
  | { kind: "empty" }
  | { kind: "unavailable" }
  | { kind: "gpu-unavailable" }
  | { kind: "context-lost" };

/** Non-blocking conditions may occur together over a usable field. */
export type CanvasAnnotation =
  | { kind: "unknown-tier"; tiers: string[] }
  | { kind: "degraded"; tiers: string[]; reasons: Record<string, string> }
  | { kind: "links-building" }
  | { kind: "links-refreshing" }
  | { kind: "truncated"; total: number; returned: number; reason: string }
  | { kind: "refreshing" };

/** Annotation array order is the visible priority order. */
export interface CanvasOverlayView {
  primary: CanvasPrimary;
  annotations: CanvasAnnotation[];
}

export type CanvasState = CanvasOverlayView;

export interface CanvasStateInputs {
  scope: string | null;
  granularity: "document" | "feature";
  stageSurface: SurfaceStates["stage"];
  slice: GraphSlice | null;
  queriedScope: string | null;
  availability: GraphSliceAvailability;
  renderCapability: RenderCapability;
  /** True when `scope` is null BECAUSE the workspace resolution itself failed
   *  (the `/map` read errored, or its served tiers report the structural tier
   *  down) — read from the stores-owned `useWorkspaceMapSurface` truth, never
   *  guessed from a bare transport error. A scope that is merely still resolving
   *  (the map query is in flight, or genuinely has no default) stays the existing
   *  `awaiting-scope` loading treatment; only a confirmed resolution failure
   *  upgrades to the degraded `unavailable` card — otherwise the canvas sat in an
   *  infinite loading spinner during a full backend outage instead of reporting
   *  it (state-mode-uniformity ADR D1: a transport/capability failure maps to the
   *  same degraded treatment as a tiers-reported outage). */
  scopeResolutionFailed: boolean;
}

/** Preserve blocking-state precedence before considering the held data. */
function resolvePrimary(inputs: CanvasStateInputs): CanvasPrimary {
  const {
    scope,
    granularity,
    stageSurface,
    slice,
    queriedScope,
    availability,
    renderCapability,
    scopeResolutionFailed,
  } = inputs;
  if (stageSurface === "empty-invitation") return { kind: "empty" };
  if (scope === null) {
    return scopeResolutionFailed ? { kind: "unavailable" } : { kind: "awaiting-scope" };
  }
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

/** Resolve every active annotation in visible priority order. */
function resolveAnnotations(inputs: CanvasStateInputs): CanvasAnnotation[] {
  const { slice, availability } = inputs;
  const annotations: CanvasAnnotation[] = [];
  const edgeDegradedTiers = availability.degradedTiers.filter((t) => t !== "semantic");
  const unknown = edgeDegradedTiers.filter((t) => !KNOWN_TIERS.has(t));
  if (unknown.length > 0) annotations.push({ kind: "unknown-tier", tiers: unknown });

  const declaredReason = availability.reasons.declared;
  const declaredDegraded = edgeDegradedTiers.includes("declared");
  const linksBuilding = declaredDegraded && isTierBuildingReason(declaredReason);
  const linksRefreshing = declaredDegraded && isTierRefreshingReason(declaredReason);

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

/** Blocking states suppress annotations because no usable field is visible. */
export function resolveCanvasState(inputs: CanvasStateInputs): CanvasOverlayView {
  const primary = resolvePrimary(inputs);
  return {
    primary,
    annotations: primary.kind === "ok" ? resolveAnnotations(inputs) : [],
  };
}

const CENTERED_SLOT =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-fg-4";

const CARD_SHELL =
  "flex flex-col items-center justify-center gap-[0.625rem] rounded-[0.625rem] border border-rule bg-paper-raised px-[1.625rem] py-[1.375rem] text-center";

/** Shared centered card. Interactive callers opt back into pointer events. */
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
    <div className={CENTERED_SLOT} data-canvas-state={testid} role="status">
      <div className={`${CARD_SHELL} ${interactive ? "pointer-events-auto" : ""}`}>
        {children}
      </div>
    </div>
  );
}

/** Centered prose with no surface of its own: the treatment for a state that is
 *  simply an absence (nothing matched), where a card and a glyph would dress up
 *  a non-event. Error and caution states keep the card — they need the contrast
 *  to stay legible over a live field. */
function CenteredProse({ children, testid }: { children: string; testid: string }) {
  return (
    <div className={CENTERED_SLOT} data-canvas-state={testid} role="status">
      <p className="text-body text-ink-muted">{children}</p>
    </div>
  );
}

function CenteredLoader({ testid, label }: { testid: string; label: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center bg-paper/70"
      data-canvas-state={testid}
    >
      <Spinner label={label} />
    </div>
  );
}

/** A degradation-class annotation reads as the field's DEGRADED mode and gets the
 *  centered caution treatment (the same coordinates and the same caution mark as
 *  the blocking `unavailable` card), never a quiet rail caption.
 *
 *  A tier whose only reason is that it is still BUILDING is LOADING, not degraded:
 *  it keeps the quiet caption idiom the other in-progress annotations use, so the
 *  caution mark never fires for work that is simply still arriving. */
function isCautionAnnotation(annotation: CanvasAnnotation): boolean {
  if (annotation.kind === "unknown-tier") return true;
  if (annotation.kind !== "degraded") return false;
  return (
    degradedCanvasMessage(annotation.tiers, annotation.reasons).key !==
    CANVAS_STATE_MESSAGES.loadingDetails.key
  );
}

/** The centered caution: one caution mark over the sentence(s) explaining what is
 *  unavailable. Stacked into a single card so two co-occurring degradations never
 *  paint two cards at the same centered coordinates. */
function CautionNotice({
  annotations,
  resolveMessage,
}: {
  annotations: CanvasAnnotation[];
  resolveMessage: ResolveMessage;
}) {
  if (annotations.length === 0) return null;
  return (
    <div className={CENTERED_SLOT}>
      <div className={CARD_SHELL}>
        <TriangleAlert aria-hidden size={20} className="shrink-0 text-state-stale" />
        {annotations.map((annotation) => (
          <p
            key={annotation.kind}
            className="text-body font-medium text-state-stale"
            data-canvas-state={annotation.kind}
            role="status"
          >
            {resolveMessage(cautionMessage(annotation)).message}
          </p>
        ))}
      </div>
    </div>
  );
}

function cautionMessage(annotation: CanvasAnnotation): MessageDescriptor {
  return annotation.kind === "degraded"
    ? degradedCanvasMessage(annotation.tiers, annotation.reasons)
    : CANVAS_STATE_MESSAGES.partialUnavailable;
}

function AnnotationRail({
  annotations,
  resolveMessage,
}: {
  annotations: CanvasAnnotation[];
  resolveMessage: ResolveMessage;
}) {
  if (annotations.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-fg-3 flex flex-col-reverse items-center gap-fg-1-5 px-fg-4">
      {annotations.map((annotation) => (
        <AnnotationChip
          key={annotation.kind}
          annotation={annotation}
          resolveMessage={resolveMessage}
        />
      ))}
    </div>
  );
}

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
      className={`pointer-events-auto flex max-w-[34rem] items-center gap-fg-2 text-pretty rounded-fg-md border border-rule bg-paper-raised/95 px-fg-3 py-fg-1-5 text-center text-label shadow-fg-overlay ${
        tone === "warn" ? "text-state-stale" : "text-ink-muted"
      }`}
      data-canvas-state={testid}
      role="status"
    >
      {children}
    </div>
  );
}

function QuietCaption({
  children,
  testid,
}: {
  children: React.ReactNode;
  testid: string;
}) {
  return (
    <div
      className="pointer-events-none rounded-fg-sm bg-paper-raised/85 px-fg-2 py-fg-0-5 text-caption text-ink-muted"
      data-canvas-state={testid}
      role="status"
    >
      {children}
    </div>
  );
}

function truncatedMessage(
  returned: number,
  total: number,
): MessageDescriptor<"graph:canvas.states.truncated"> {
  return Object.freeze({
    key: CANVAS_STATE_MESSAGES.truncated.key,
    values: Object.freeze({ returned, total }),
  });
}

export function degradedCanvasMessage(
  tiers: string[],
  reasons: Record<string, string>,
): MessageDescriptor {
  const loadingOnly =
    tiers.length > 0 && tiers.every((tier) => isTierBuildingReason(reasons[tier]));
  return loadingOnly
    ? CANVAS_STATE_MESSAGES.loadingDetails
    : CANVAS_STATE_MESSAGES.partialUnavailable;
}

function AnnotationChip({
  annotation,
  resolveMessage,
}: {
  annotation: CanvasAnnotation;
  resolveMessage: ResolveMessage;
}) {
  switch (annotation.kind) {
    // Both degradation-class annotations are lifted out of the rail by
    // `isCautionAnnotation` and rendered by `CautionNotice`; only a
    // still-BUILDING tier reaches the rail, as the quiet in-progress caption it
    // actually is.
    case "unknown-tier":
      return null;
    case "degraded":
      return (
        <QuietCaption testid="degraded">
          {
            resolveMessage(degradedCanvasMessage(annotation.tiers, annotation.reasons))
              .message
          }
        </QuietCaption>
      );
    case "links-building":
      return (
        <OverlayChip testid="links-building" tone="muted">
          <span>
            {resolveMessage(CANVAS_STATE_MESSAGES.loadingDocumentLinks).message}
          </span>
        </OverlayChip>
      );
    case "truncated":
      return (
        <OverlayChip testid="truncated" tone="warn">
          <ScanSearch aria-hidden size={16} strokeWidth={1.5} />
          <span data-tabular className="tabular-nums">
            {
              resolveMessage(truncatedMessage(annotation.returned, annotation.total))
                .message
            }
          </span>
          <Button variant="ghost" onClick={() => setFilterSidebarOpen(true)}>
            {resolveMessage(CANVAS_STATE_MESSAGES.openFilters).message}
          </Button>
        </OverlayChip>
      );
    case "links-refreshing":
      return (
        <QuietCaption testid="links-refreshing">
          {resolveMessage(CANVAS_STATE_MESSAGES.refreshingDocumentLinks).message}
        </QuietCaption>
      );
    case "refreshing":
      return (
        <QuietCaption testid="refreshing">
          {resolveMessage(CANVAS_STATE_MESSAGES.refreshing).message}
        </QuietCaption>
      );
  }
}

export function CanvasStateOverlay({ state }: { state: CanvasOverlayView }) {
  const resolveMessage = useLocalizedMessageResolver();
  const cautions = state.annotations.filter(isCautionAnnotation);
  const rail = state.annotations.filter((a) => !isCautionAnnotation(a));
  return (
    <>
      <PrimaryCard primary={state.primary} resolveMessage={resolveMessage} />
      <CautionNotice annotations={cautions} resolveMessage={resolveMessage} />
      <AnnotationRail annotations={rail} resolveMessage={resolveMessage} />
    </>
  );
}

function PrimaryCard({
  primary,
  resolveMessage,
}: {
  primary: CanvasPrimary;
  resolveMessage: ResolveMessage;
}) {
  switch (primary.kind) {
    case "ok":
      return null;
    case "awaiting-scope":
    case "loading-constellation":
    case "loading-document":
      return (
        <CenteredLoader
          testid={primary.kind}
          label={resolveMessage(CANVAS_STATE_MESSAGES.loading).message}
        />
      );
    case "empty":
      // An absence is not an error: plain centered text, no card and no glyph.
      return (
        <CenteredProse testid="empty">
          {resolveMessage(CANVAS_STATE_MESSAGES.noFilterMatches).message}
        </CenteredProse>
      );
    case "unavailable":
      return (
        <StateCard testid="unavailable">
          <TriangleAlert aria-hidden size={20} className="shrink-0 text-state-stale" />
          <p className="text-body font-medium text-state-stale">
            {resolveMessage(CANVAS_STATE_MESSAGES.unavailable).message}
          </p>
        </StateCard>
      );
    case "gpu-unavailable":
      return (
        <StateCard testid="gpu-unavailable">
          <p className="text-body font-medium text-state-stale">
            {resolveMessage(CANVAS_STATE_MESSAGES.graphicsTitle).message}
          </p>
          <p className="text-label text-ink-muted">
            {resolveMessage(CANVAS_STATE_MESSAGES.graphicsMessage).message}
          </p>
        </StateCard>
      );
    case "context-lost":
      // Loading is UI-ONLY (state-mode-uniformity ADR D2): the same text-free
      // centered spinner as the other transient blocking states, the human label
      // only in the Spinner's own `sr-only` text — never a spinner PLUS a visible
      // caption for the same condition.
      return (
        <CenteredLoader
          testid="context-lost"
          label={resolveMessage(CANVAS_STATE_MESSAGES.restoring).message}
        />
      );
  }
}
