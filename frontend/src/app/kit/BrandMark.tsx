// The product's own brand mark — the three-node linkage graph that identifies the
// app (the same geometry the document favicon paints). It is NOT an icon-family
// glyph: the two sanctioned families (Lucide / Phosphor) carry structural chrome
// and domain marks, while product identity is a mark of its own, so it lives here
// as a kit primitive rather than as an ad-hoc inline SVG on one surface
// (design-system-is-centralized: a missing primitive is a gap to close in the
// library). Any surface that needs the app's own mark composes THIS component.
//
// Color is token-driven: the geometry paints in `currentColor`, so the caller sets
// the tone with a normal text-color utility (`text-accent` by default). No raw hex,
// no gradient, no plate — the mark sits directly on the surface it is placed on.

/** The app's linkage-graph mark. `size` is the rendered square edge in the same
 *  numeric convention the family glyphs take (`<BrandMark size={32} />`); the
 *  intrinsic geometry is a 32-unit viewBox, so it scales cleanly at any size. */
export function BrandMark({
  size = 32,
  className = "text-accent",
  title,
}: {
  size?: number;
  className?: string;
  /** Accessible name. Omit for a decorative mark (the default) — it then renders
   *  `aria-hidden`, so a neighbouring heading carries the meaning. */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      role={title === undefined ? undefined : "img"}
      aria-hidden={title === undefined ? true : undefined}
      aria-label={title}
      focusable="false"
      data-brand-mark
    >
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.75"
      >
        <line x1="10" y1="11" x2="22" y2="9" />
        <line x1="10" y1="11" x2="14" y2="23" />
      </g>
      <g fill="currentColor">
        <circle cx="10" cy="11" r="3.5" />
        <circle cx="22" cy="9" r="2.5" />
        <circle cx="14" cy="23" r="2.5" />
      </g>
    </svg>
  );
}
