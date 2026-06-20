export const REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";

/** True when the OS asks for reduced motion. Non-DOM hosts fall back to false. */
export function prefersReducedMotion(): boolean {
  const matchMedia = globalThis.matchMedia;
  return (
    typeof matchMedia === "function" && matchMedia(REDUCED_MOTION_MEDIA_QUERY).matches
  );
}
