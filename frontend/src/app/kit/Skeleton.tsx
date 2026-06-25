// Shared loading-skeleton primitive (state-mode-uniformity ADR D2/D4). Loading is
// UI-ONLY: a pulsing skeleton that mimics the content's rhythm, NEVER on-screen text.
// The human label lives only in `sr-only` under `role="status" aria-busy`. Every surface
// composes these instead of hand-rolling a pulsing-text loader. Tokens only — the shimmer
// fill is `bg-rule-strong`, the pulse the shared `animate-pulse-live` utility gated on
// `motion-safe`; no raw hex, no loose sizes (no-hardcoded-px / design-system-is-centralized).

import type { ReactNode } from "react";

/** The loading wrapper: announces busy state to AT, pulses the skeleton under it, and
 *  carries the only human-readable label (screen-reader only). Children are the skeleton
 *  shapes that mimic the loaded content. */
export function Skeleton({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      data-skeleton
      className={`flex flex-col gap-fg-2 motion-safe:animate-pulse-live ${className ?? ""}`}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** A single shimmer bar. `width`/`height` are utility classes so callers size to the
 *  content line they stand in for (`w-1/4`, `w-[5rem]`, `flex-1`). */
export function SkeletonBar({
  width = "w-full",
  height = "h-2",
  className,
}: {
  width?: string;
  height?: string;
  className?: string;
}) {
  return (
    <span
      className={`block rounded-fg-xs bg-rule-strong ${height} ${width} ${className ?? ""}`}
    />
  );
}

/** A list/tree/card row skeleton: a leading dot + a flexible bar. `boxed` renders the
 *  raised-card framing some surfaces (the activity rail) use; otherwise it is a bare
 *  tree/list row. */
export function SkeletonRow({
  width = "w-1/2",
  boxed = false,
}: {
  width?: string;
  boxed?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-fg-2 ${
        boxed
          ? "rounded-fg-sm border border-rule bg-paper-raised px-fg-2 py-[0.6875rem]"
          : ""
      }`}
    >
      <span className="size-3 shrink-0 rounded-full bg-rule-strong" />
      <SkeletonBar width={boxed ? "flex-1" : width} />
    </div>
  );
}
