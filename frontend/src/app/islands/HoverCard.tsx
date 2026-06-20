// Hover-bloom card (node-visual-richness prototype) — the rich hover affordance
// that blooms over a node on hover, showing its kind, title, status, rollout,
// and a provenance microline. DUMB RENDERER: it takes a stores-owned
// StatusCardModel and renders; it does NOT fetch, read the raw tiers block, or
// derive per-type content locally (dashboard-layer-ownership).
//
// Instrument register (warmth-lives-in-tokens-not-decoration): no gradients, no
// textures, no second accent. Color comes only from the semantic token layer —
// the status class's reinforcing tint (`stampToken`), the ink/paper/rule tokens,
// and the single accent for the rollout bar. Shape and copy carry meaning; the
// tint only echoes the status class.
//
// Motion (base motion law): the card blooms from a transform-origin with a
// ~180ms ease-out grow + fade. Under prefers-reduced-motion (OS) or an explicit
// `reducedMotion` prop, the transform travel is dropped for an instant crossfade
// — the reduced-motion floor honored at this surface's own path.
//
// Marks: the kind glyph is the shared domain-mark family (`DocTypeMark` /
// `MarkById`), so the card icon reads as one hand with the canvas silhouettes.

import { ExternalLink } from "lucide-react";
import { type ReactNode } from "react";

import { DocTypeMark, MarkById } from "../../scene/field/markComponents";
import {
  type NodeStatus,
  type StatusClass,
  stampFor,
  stampToken,
} from "../../scene/field/statusStamp";
import { useReducedMotion } from "../chrome/useReducedMotion";
import {
  deriveStatusCardPresentationView,
  type StatusCardModel,
  useStatusCardBloomMotionView,
} from "../../stores/view/statusCard";
import {
  categoryTokenVar,
  type TypeCardContent,
} from "../../stores/view/hoverCardContent";
export type { StatusCardModel } from "../../stores/view/statusCard";

export interface StatusHoverCardProps {
  readonly model: StatusCardModel;
  /** Force the reduced-motion path (else the OS media query decides). */
  readonly reducedMotion?: boolean;
  /** Fired by the open affordance (the external-link button). */
  readonly onOpen?: (id: string) => void;
}

export function StatusHoverCard({
  model,
  reducedMotion,
  onOpen,
}: StatusHoverCardProps) {
  const cls: StatusClass | undefined = model.status?.class;
  const tintVar = stampToken(cls);
  const presentation = deriveStatusCardPresentationView(model);
  // The per-category accent (a `var()` on :root, per theme): drives the left
  // strip and the header glyph hue when a category is known; the status tint is
  // the fallback so the existing cardless prototype still reads.
  const categoryVar = model.category ? categoryTokenVar(model.category) : undefined;
  const accentVar = categoryVar ?? tintVar;

  // Resolve the motion path once on mount: the explicit prop overrides, else the
  // shared reduced-motion hook. A ref + state lets the bloom class be applied
  // after the first paint so the grow animation actually runs (not skipped as
  // initial).
  const sharedReducedMotion = useReducedMotion();
  const reduce = reducedMotion ?? sharedReducedMotion;
  const motion = useStatusCardBloomMotionView(reduce);

  return (
    <div
      role="dialog"
      aria-label={`${model.kind} ${model.title}`}
      data-hover-card
      data-category={model.category}
      data-reduced-motion={motion.reducedMotion ? "" : undefined}
      data-motion={motion.motion}
      className="relative flex w-64 flex-col gap-fg-1-5 overflow-hidden rounded-fg-md border border-rule bg-paper-raised p-fg-2 pl-fg-3 text-ink shadow-fg-overlay"
      style={motion.style}
    >
      {/* Category-accent strip: a single-token vertical rule that names the
          node's category by hue. Warmth lives in this one token, never a
          gradient or texture (warmth-lives-in-tokens-not-decoration). */}
      <span
        data-category-strip
        aria-hidden
        className="absolute inset-y-0 left-0 w-fg-0-5"
        style={{ backgroundColor: `var(${accentVar})` }}
      />
      {/* Header: category dot + kind glyph + title + open affordance. */}
      <div className="flex items-center gap-fg-1-5">
        <span
          className="flex shrink-0 items-center"
          style={{ color: `var(${accentVar})` }}
          aria-hidden
        >
          <DocTypeMark kind={model.kind} size={16} />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-body-strong font-medium text-ink">
          {model.title}
        </h3>
        <button
          type="button"
          onClick={() => onOpen?.(model.id)}
          aria-label={`open ${model.title}`}
          data-hover-open
          // The card may be hosted inside an inspect-only (pointer-events:none)
          // wrapper so the transient hover card never steals the pointer; the
          // open affordance is the one interactive escape, so it re-enables
          // pointer events on itself (the bloom → open intent).
          className="pointer-events-auto flex shrink-0 items-center rounded-fg-xs p-fg-0-5 text-ink-muted transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken hover:text-ink"
        >
          <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      {/* Status chip: the raw value, tinted by the class token (tint reinforces). */}
      {model.status?.value && (
        <div>
          <span
            data-status-chip
            className="inline-flex items-center gap-fg-1 rounded-fg-xs border px-fg-1 py-fg-0-5 text-label"
            style={{
              color: `var(${tintVar})`,
              borderColor: `var(${tintVar})`,
            }}
          >
            <StatusGlyph status={model.status} />
            {model.status.value}
          </span>
        </div>
      )}

      {/* Type-specific content: the conditional info plane (Figma 110:2). */}
      {model.typeContent && <TypeContentBlock content={model.typeContent} />}

      {/* Rollout bar: the SEPARATE progress channel (plan/feature), accent fill. */}
      {presentation.rollout !== null && (
        <div data-rollout>
          <div className="mb-fg-0-5 flex items-center justify-between text-caption text-ink-muted">
            <span>rollout</span>
            <span data-tabular className="tabular-nums">
              {presentation.rollout.label}
            </span>
          </div>
          <div
            className="h-fg-1-5 w-full overflow-hidden rounded-fg-xs bg-paper-sunken"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={presentation.rollout.total}
            aria-valuenow={presentation.rollout.done}
          >
            <div
              data-rollout-fill
              className="h-full rounded-fg-xs bg-accent"
              style={{ width: presentation.rollout.width }}
            />
          </div>
        </div>
      )}

      {/* Microline: authority class + severity/tier magnitude (provenance tail). */}
      {presentation.microline && (
        <p className="text-caption text-ink-faint" data-microline>
          {presentation.microline}
        </p>
      )}

      {/* Identity tail: the node id is true identity → monospace. */}
      <p className="break-all font-mono text-caption text-ink-faint" data-card-id>
        {model.id}
      </p>
    </div>
  );
}

/**
 * The status shape glyph inside the chip — a severity gauge or a tier notch from
 * the shared mark family when the class carries a magnitude, else nothing (the
 * chip's tint + value already read the affirmed/retired/negated classes, whose
 * stamp is a ring/ghost/slash treatment on the NODE, not a chip glyph).
 */
function StatusGlyph({ status }: { status: NodeStatus }) {
  const stamp = stampFor(status);
  if (stamp.severityDot) {
    return (
      <MarkById id={`status-severity-${stamp.severityDot}`} size={12} aria-hidden />
    );
  }
  if (stamp.tierNotch) {
    return <MarkById id={`status-tier-${stamp.tierNotch}`} size={12} aria-hidden />;
  }
  return null;
}

/** One info line of the type-content plane: a muted, tabular-friendly row. */
function InfoLine({ children }: { children: ReactNode }) {
  return (
    <p className="text-caption text-ink-muted" data-type-line>
      {children}
    </p>
  );
}

/**
 * The type-specific content plane (Figma 110:2). Each document type renders the
 * facts its register carries — sourced PURELY from the wire projection
 * (stores/view/hoverCardContent.deriveTypeContent); a datum genuinely absent from the wire is
 * simply not rendered, never fabricated. The block stays inside the instrument
 * register: copy + the muted ink token carry meaning, no new color.
 */
function TypeContentBlock({ content }: { content: TypeCardContent }) {
  switch (content.kind) {
    case "plan": {
      const parts: string[] = [];
      if (content.tier) parts.push(content.tier);
      if (content.steps && content.steps.total > 0) {
        parts.push(`${content.steps.done}/${content.steps.total} steps`);
      }
      if (content.phasesLeft !== undefined) {
        parts.push(`${content.phasesLeft} phases left`);
      }
      if (parts.length === 0) return null;
      return (
        <div data-type-content="plan" className="flex flex-col gap-fg-0-5">
          <InfoLine>{parts.join(" · ")}</InfoLine>
        </div>
      );
    }
    case "adr": {
      if (content.references === undefined) return null;
      return (
        <div data-type-content="adr">
          <InfoLine>
            {content.references} reference{content.references === 1 ? "" : "s"}
          </InfoLine>
        </div>
      );
    }
    case "exec": {
      if (!content.inPlan) return null;
      return (
        <div data-type-content="exec">
          <InfoLine>in plan — {content.inPlan}</InfoLine>
        </div>
      );
    }
    case "research": {
      const parts: string[] = [];
      if (content.findings !== undefined) {
        parts.push(`${content.findings} finding${content.findings === 1 ? "" : "s"}`);
      }
      if (content.when) parts.push(content.when);
      if (parts.length === 0) return null;
      return (
        <div data-type-content="research">
          <InfoLine>{parts.join(" · ")}</InfoLine>
        </div>
      );
    }
    case "audit": {
      const parts: string[] = [];
      if (content.severity) parts.push(content.severity);
      if (content.findings !== undefined) {
        parts.push(`${content.findings} finding${content.findings === 1 ? "" : "s"}`);
      }
      if (parts.length === 0) return null;
      return (
        <div data-type-content="audit">
          <InfoLine>{parts.join(" · ")}</InfoLine>
        </div>
      );
    }
    case "topic": {
      if (content.documents === undefined) return null;
      return (
        <div data-type-content="topic">
          <InfoLine>
            {content.documents} document{content.documents === 1 ? "" : "s"}
          </InfoLine>
        </div>
      );
    }
    case "code": {
      return (
        <div data-type-content="code" className="flex flex-col gap-fg-0-5">
          <p className="break-all font-mono text-caption text-ink-muted" data-code-path>
            {content.path}
          </p>
          {(content.language || content.gitDirty) && (
            <InfoLine>
              {[content.language, content.gitDirty ? "uncommitted changes" : undefined]
                .filter(Boolean)
                .join(" · ")}
            </InfoLine>
          )}
        </div>
      );
    }
    case "generic":
      return null;
  }
}
