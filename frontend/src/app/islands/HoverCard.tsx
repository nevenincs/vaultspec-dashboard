// Hover-bloom card (node-visual-richness prototype) — the rich hover affordance
// that blooms over a node on hover, showing its kind, title, status, rollout,
// and a provenance microline. SELF-CONTAINED: it takes a typed StatusCardModel
// prop and renders; it does NOT fetch, read the raw tiers block, or wire itself
// into IslandLayer (the prototype mounts it directly, and a post-merge
// integration would feed it from a stores selector — dashboard-layer-ownership).
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
import { type CSSProperties, useEffect, useRef, useState } from "react";

import { DocTypeMark, MarkById } from "../../scene/field/markComponents";
import {
  type NodeStatus,
  type StatusClass,
  stampFor,
  stampToken,
} from "../../scene/field/statusStamp";

/** The card's view model — a projection a stores selector would supply. */
export interface StatusCardModel {
  /** Stable node id (identity-bearing; rendered monospace). */
  readonly id: string;
  /** GLYPH_KINDS species (adr / plan / audit / rule / feature / …). */
  readonly kind: string;
  readonly title: string;
  readonly status?: NodeStatus;
  /** A coarse authority label for the microline (e.g. "accepted decision"). */
  readonly authorityClass?: string;
  /** Rollout progress (plan/feature) — the SEPARATE channel, a bar not a stamp. */
  readonly progress?: { done: number; total: number };
}

export interface HoverCardProps {
  readonly model: StatusCardModel;
  /** Force the reduced-motion path (else the OS media query decides). */
  readonly reducedMotion?: boolean;
  /** Fired by the open affordance (the external-link button). */
  readonly onOpen?: (id: string) => void;
}

/** True when the OS asks for reduced motion (the base motion-law floor). */
function osPrefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** A 0..1 rollout fraction from done/total, clamped; null when absent. */
function rolloutFraction(progress: StatusCardModel["progress"]): number | null {
  if (!progress || progress.total <= 0) return null;
  return Math.max(0, Math.min(1, progress.done / progress.total));
}

/** The severity grade / tier rank line for the microline, by descriptor. */
function magnitudeLabel(status: NodeStatus | undefined): string | null {
  if (!status) return null;
  const stamp = stampFor(status);
  if (stamp.severityDot) return `severity ${stamp.severityDot}/4`;
  if (stamp.tierNotch) return `tier ${stamp.tierNotch}/4`;
  return null;
}

export function HoverCard({ model, reducedMotion, onOpen }: HoverCardProps) {
  const cls: StatusClass | undefined = model.status?.class;
  const tintVar = stampToken(cls);
  const fraction = rolloutFraction(model.progress);
  const magnitude = magnitudeLabel(model.status);

  // Resolve the motion path once on mount: the explicit prop overrides, else the
  // OS media query. A ref + state lets the bloom class be applied after the
  // first paint so the grow animation actually runs (not skipped as initial).
  const reduce = reducedMotion ?? osPrefersReducedMotion();
  const [bloomed, setBloomed] = useState(false);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    rafRef.current = requestAnimationFrame(() => setBloomed(true));
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // The bloom: an ease-out grow from the card's transform-origin (top-left,
  // where the node sits) plus a fade, ~180ms. Reduced motion drops the transform
  // travel entirely — an instant crossfade, no scale.
  const motionStyle: CSSProperties = reduce
    ? {
        opacity: bloomed ? 1 : 0,
        transition: "opacity var(--duration-ui-fast, 150ms) var(--ease-settle)",
      }
    : {
        opacity: bloomed ? 1 : 0,
        transform: bloomed ? "scale(1)" : "scale(0.92)",
        transformOrigin: "top left",
        transition:
          "opacity 180ms var(--ease-settle, ease-out), transform 180ms var(--ease-settle, ease-out)",
      };

  return (
    <div
      role="dialog"
      aria-label={`${model.kind} ${model.title}`}
      data-hover-card
      data-reduced-motion={reduce ? "" : undefined}
      data-motion={reduce ? "crossfade" : "bloom"}
      className="w-64 rounded-vs-md border border-rule bg-paper-raised p-vs-2 text-ink shadow-float"
      style={motionStyle}
    >
      {/* Header: kind glyph + title + open affordance. */}
      <div className="flex items-center gap-vs-1-5">
        <span
          className="flex shrink-0 items-center"
          style={{ color: `var(${tintVar})` }}
          aria-hidden
        >
          <DocTypeMark kind={model.kind} size={16} />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-title font-medium text-ink">
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
          className="pointer-events-auto flex shrink-0 items-center rounded-vs-sm p-vs-0-5 text-ink-muted transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken hover:text-ink"
        >
          <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      {/* Status chip: the raw value, tinted by the class token (tint reinforces). */}
      {model.status?.value && (
        <div className="mt-vs-1-5">
          <span
            data-status-chip
            className="inline-flex items-center gap-vs-1 rounded-vs-sm border px-vs-1 py-vs-0-5 text-label"
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

      {/* Rollout bar: the SEPARATE progress channel (plan/feature), accent fill. */}
      {fraction !== null && model.progress && (
        <div className="mt-vs-2" data-rollout>
          <div className="mb-vs-0-5 flex items-center justify-between text-2xs text-ink-muted">
            <span>rollout</span>
            <span data-tabular className="tabular-nums">
              {model.progress.done}/{model.progress.total}
            </span>
          </div>
          <div
            className="h-vs-1-5 w-full overflow-hidden rounded-vs-sm bg-paper-sunken"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={model.progress.total}
            aria-valuenow={model.progress.done}
          >
            <div
              data-rollout-fill
              className="h-full rounded-vs-sm bg-accent"
              style={{ width: `${Math.round(fraction * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Microline: authority class + severity/tier magnitude (provenance tail). */}
      {(model.authorityClass || magnitude) && (
        <p className="mt-vs-2 text-2xs text-ink-faint" data-microline>
          {[model.authorityClass, magnitude].filter(Boolean).join(" · ")}
        </p>
      )}

      {/* Identity tail: the node id is true identity → monospace. */}
      <p className="mt-vs-1 break-all font-mono text-2xs text-ink-faint" data-card-id>
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
