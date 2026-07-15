import { ScanSearch } from "lucide-react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import { Button, Folder, Spinner, TriangleAlert } from "../kit";
import { setFilterSidebarOpen } from "../../stores/view/filterSidebar";
import type { GraphSlice } from "../../stores/server/engine";
import type { GraphSliceAvailability } from "../../stores/server/queries";
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

/** Resolve every active annotation in visible priority order. */
function resolveAnnotations(inputs: CanvasStateInputs): CanvasAnnotation[] {
  const { slice, availability } = inputs;
  const annotations: CanvasAnnotation[] = [];
  const edgeDegradedTiers = availability.degradedTiers.filter((t) => t !== "semantic");
  const unknown = edgeDegradedTiers.filter((t) => !KNOWN_TIERS.has(t));
  if (unknown.length > 0) annotations.push({ kind: "unknown-tier", tiers: unknown });

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

/** Blocking states suppress annotations because no usable field is visible. */
export function resolveCanvasState(inputs: CanvasStateInputs): CanvasOverlayView {
  const primary = resolvePrimary(inputs);
  return {
    primary,
    annotations: primary.kind === "ok" ? resolveAnnotations(inputs) : [],
  };
}

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
    tiers.length > 0 && tiers.every((tier) => isBuildingReason(reasons[tier]));
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
    case "unknown-tier":
      return (
        <OverlayChip testid="unknown-tier" tone="warn">
          <TriangleAlert aria-hidden size={16} strokeWidth={1.5} />
          <span>
            {resolveMessage(CANVAS_STATE_MESSAGES.partialUnavailable).message}
          </span>
        </OverlayChip>
      );
    case "degraded":
      return (
        <OverlayChip testid="degraded" tone="muted">
          <span>
            {
              resolveMessage(
                degradedCanvasMessage(annotation.tiers, annotation.reasons),
              ).message
            }
          </span>
        </OverlayChip>
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
  return (
    <>
      <PrimaryCard primary={state.primary} resolveMessage={resolveMessage} />
      <AnnotationRail annotations={state.annotations} resolveMessage={resolveMessage} />
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
      return (
        <StateCard testid="empty">
          <Folder aria-hidden size={20} className="shrink-0 text-ink-faint" />
          <p className="text-body text-ink-muted">
            {resolveMessage(CANVAS_STATE_MESSAGES.noFilterMatches).message}
          </p>
        </StateCard>
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
    case "context-lost": {
      const message = resolveMessage(CANVAS_STATE_MESSAGES.restoring).message;
      return (
        <StateCard testid="context-lost">
          <span aria-hidden>
            <Spinner label={message} />
          </span>
          <p className="text-label text-ink-muted">{message}</p>
        </StateCard>
      );
    }
  }
}

function isBuildingReason(reason: string | undefined): boolean {
  return reason !== undefined && reason.toLowerCase().includes("building");
}

function isRefreshingReason(reason: string | undefined): boolean {
  return reason !== undefined && reason.toLowerCase().includes("refreshing");
}
