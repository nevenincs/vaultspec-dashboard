// ProgressBar — the centralized determinate progress track (figma-frontend-rewrite
// W01.P02.S05; binding kit board 135:2). A sunken paper track with an accent fill,
// used for plan completion (e.g. "18/24") in the activity-rail plan tree. The fill
// width is the clamped value/max ratio; the surface stays token-pure (sunken track,
// accent fill, pill radius). Display-only and prop-driven. Exposes the ARIA
// progressbar contract so the ratio is announced, with an optional inline tabular
// readout.

import type { HTMLAttributes } from "react";

export interface ProgressBarProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> {
  /** Current progress. Clamped into [0, max]. */
  value: number;
  /** Upper bound. Defaults to 100. */
  max?: number;
  /** Accessible name for the track. */
  label?: string;
  /** Render the "value/max" tabular readout beside the track. */
  showValue?: boolean;
}

export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = false,
  className = "",
  ...rest
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const pct = (clamped / safeMax) * 100;
  return (
    <div className={`flex items-center gap-fg-2 ${className}`.trim()} {...rest}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clamped}
        className="h-fg-1-5 min-w-0 flex-1 overflow-hidden rounded-fg-pill bg-paper-sunken"
      >
        <div
          className="h-full rounded-fg-pill bg-accent transition-[width] duration-ui ease-settle"
          style={{ width: `${pct}%` }}
        />
      </div>
      {showValue && (
        <span data-tabular className="shrink-0 tabular-nums text-meta text-ink-muted">
          {clamped}/{safeMax}
        </span>
      )}
    </div>
  );
}
