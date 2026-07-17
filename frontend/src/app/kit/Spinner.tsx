// Kit Spinner — the app's ONE loading-ring idiom, matching the pre-hydration boot
// shell (index.html `#boot-shell .boot-spinner`): a neutral ring with an accent top
// arc that rotates. The canvas global loader and any future in-app centered load state
// compose this rather than re-inventing a ring, so the boot-to-app loading read is
// continuous (design-system-is-centralized). Reduced-motion-safe: the rotation SLOWS
// (never hard-stops), mirroring the boot shell's `prefers-reduced-motion` rule so the
// "busy" cue survives while the motion is gentled. Tokens + rem only.

export interface SpinnerProps {
  /** Ring diameter: `md` (2rem) matches the boot shell; `sm` (1.25rem) inline. */
  size?: "sm" | "md";
  /** Accessible label — required; the caller supplies a localized load message. */
  label: string;
}

const RING_SIZE: Record<NonNullable<SpinnerProps["size"]>, string> = {
  sm: "size-5",
  md: "size-8",
};

export function Spinner({ size = "md", label }: SpinnerProps) {
  return (
    <span role="status" className="inline-flex items-center justify-center">
      <span
        aria-hidden
        className={`${RING_SIZE[size]} animate-spin rounded-full border-[0.1875rem] border-rule border-t-accent motion-reduce:[animation-duration:2.4s]`}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
