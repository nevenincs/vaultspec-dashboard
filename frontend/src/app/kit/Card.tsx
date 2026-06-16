// Card — the centralized surface container (figma-frontend-rewrite W01.P02.S05;
// binding kit board 135:2). A raised paper panel on the canonical radius carrying
// one of the three binding elevation levels (Card / Popover / Modal from the
// DESIGN-SPEC elevation set, surfaced here as raised / overlay / popover shadow
// tokens). Surfaces compose this instead of hand-drawing a bordered rounded-rect
// (design-system-is-centralized). Pure chrome: prop-driven, display-only, holds no
// wire state and fetches nothing.

import type { HTMLAttributes } from "react";

export type CardElevation = "flat" | "raised" | "overlay" | "popover";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Binding elevation level. Defaults to the Card "raised" drop shadow. */
  elevation?: CardElevation;
  /** Apply the standard interior padding. Defaults to true. */
  padded?: boolean;
}

const ELEVATION_CLASS: Record<CardElevation, string> = {
  flat: "",
  raised: "shadow-fg-raised",
  overlay: "shadow-fg-overlay",
  popover: "shadow-fg-popover",
};

export function Card({
  elevation = "raised",
  padded = true,
  className = "",
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={`rounded-fg-md border border-rule bg-paper-raised ${
        ELEVATION_CLASS[elevation]
      } ${padded ? "p-fg-3" : ""} ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}
