/** The approved product mark. `size` follows the numeric convention used by the
 * icon primitives (`<BrandMark size={32} />`). The image is served from the one
 * browser-identity asset rather than maintaining a second copy of its geometry. */
export function BrandMark({
  size = 32,
  className = "",
  title,
}: {
  size?: number;
  className?: string;
  /** Accessible name. Omit for a decorative mark (the default) — it then renders
   *  `aria-hidden`, so a neighbouring heading carries the meaning. */
  title?: string;
}) {
  return (
    <img
      src="/icon.svg"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      aria-hidden={title === undefined ? true : undefined}
      alt={title ?? ""}
      data-brand-mark
    />
  );
}
