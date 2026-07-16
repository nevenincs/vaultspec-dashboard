// The React chrome plane for the domain-mark family — the SAME mark source the
// Pixi texture seam consumes, rendered as DOM SVG (W02.P17.S37). Chrome that
// renders a domain species (e.g. a doc-type mark in the inspector or a tier
// mark in a legend) imports these components so the canvas and the DOM share
// one silhouette source; neither plane defines its own mark geometry.
//
// Unlike the texture seam, chrome lives in a real CSS cascade, so it consumes
// the raw `currentColor` source unchanged — no ink substitution. The mark
// inherits its color from the surrounding `color` property and its size from
// the `size` prop, exactly like the Lucide and Phosphor chrome components
// already used in `app/`. The component is presentational only: it holds no
// state, fetches nothing, and reads no tokens — hue arrives through `color:`
// from the consumer's token-styled context.

import type { MarkDef } from "./markInk";
import { MARK_GRID } from "./markInk";
import {
  DOC_TYPE_MARK_DEFS,
  EVENT_MARK_DEFS,
  STATE_MARK_DEFS,
  TIER_MARK_DEFS,
  markDef,
} from "./marks";

export interface MarkProps {
  /** Rendered edge length in px (square). Defaults to the 16px chrome size. */
  readonly size?: number;
  /** Accessible label; when omitted the mark is decorative (aria-hidden). */
  readonly title?: string;
  readonly className?: string;
}

/**
 * Render a `MarkDef` SVG body as an inline SVG inheriting `currentColor`. The geometry
 * is the project's own authored/adopted geometry (no untrusted input), set via
 * `dangerouslySetInnerHTML` because the def carries multiple path/shape
 * elements; this is the chrome analogue of the texture seam's
 * `GraphicsContext.svg(def.svgBody)` parse.
 */
export function Mark({
  def,
  size = 16,
  title,
  className,
}: MarkProps & { def: MarkDef }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={`0 0 ${MARK_GRID} ${MARK_GRID}`}
      fill="currentColor"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={className}
      dangerouslySetInnerHTML={{ __html: def.svgBody }}
    />
  );
}

/** A doc-type/feature species mark by its GLYPH_KINDS kind. */
export function DocTypeMark({ kind, ...props }: MarkProps & { kind: string }) {
  const def = DOC_TYPE_MARK_DEFS[kind];
  return def ? <Mark def={def} {...props} /> : null;
}

/** An event mark by its event kind (commit / doc-created / doc-modified / lifecycle). */
export function EventMark({ event, ...props }: MarkProps & { event: string }) {
  const def = EVENT_MARK_DEFS[event];
  return def ? <Mark def={def} {...props} /> : null;
}

/** An abstract tier mark by tier key (declared / structural / temporal / semantic). */
export function TierMark({
  tier,
  ...props
}: MarkProps & {
  tier: keyof typeof TIER_MARK_DEFS;
}) {
  return <Mark def={TIER_MARK_DEFS[tier]} {...props} />;
}

/** A lifecycle state mark by state key (active / complete / archived / broken / stale). */
export function StateMark({
  state,
  ...props
}: MarkProps & {
  state: keyof typeof STATE_MARK_DEFS;
}) {
  return <Mark def={STATE_MARK_DEFS[state]} {...props} />;
}

/** Resolve any mark by its stable id and render it, or null when unknown. */
export function MarkById({ id, ...props }: MarkProps & { id: string }) {
  const def = markDef(id);
  return def ? <Mark def={def} {...props} /> : null;
}
