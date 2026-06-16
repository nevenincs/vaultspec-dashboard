// Divider — the centralized rule (figma-frontend-rewrite W01.P02.S05; binding kit
// board 135:2, variants Neutral / Accent). A 1px separator in either orientation.
// Neutral is the felt-not-seen low-contrast rule token; Accent is the load-bearing
// accent separator. Surfaces compose this instead of hand-drawing a border line
// (design-system-is-centralized). Renders as an ARIA separator with the matching
// orientation.

import type { HTMLAttributes } from "react";

export type DividerTone = "neutral" | "accent";
export type DividerOrientation = "horizontal" | "vertical";

export interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  tone?: DividerTone;
  orientation?: DividerOrientation;
}

export function Divider({
  tone = "neutral",
  orientation = "horizontal",
  className = "",
  ...rest
}: DividerProps) {
  const toneClass = tone === "accent" ? "bg-accent" : "bg-rule";
  const sizeClass = orientation === "vertical" ? "h-full w-px" : "h-px w-full";
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={`shrink-0 ${sizeClass} ${toneClass} ${className}`.trim()}
      {...rest}
    />
  );
}
