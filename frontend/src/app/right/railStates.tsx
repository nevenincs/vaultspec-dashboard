// The activity rail's non-populated state bodies (binding ActivityRail · Status,
// node 599:2099 — the hidden `state/empty` 601:1814, `state/degraded` 609:2309, and
// `state/loading` 601:1817 frames). The rail shares ONE LocationStrip header across
// every state and swaps this body underneath it. These are DUMB presentational
// components (dashboard-layer-ownership / views-are-projections): they hold no wire
// state, fetch nothing, and read no raw `tiers` block — StatusTab resolves which one
// renders from the interpreted stores views and passes nothing but the decision.
//
// Tokens, not literals (design-system-is-centralized / themes-are-oklch /
// no-hardcoded-px): the design's `#dff3e2` check tint maps to the positive diff hue
// at low alpha, the `#9f7100` caution dot to the exact `state-stale` token, and the
// `#d5d0c9` skeleton fill to `rule-strong`; every dimension is rem.

import { Check } from "lucide-react";

export type RailState = "populated" | "empty" | "degraded" | "loading";

// ---------------------------------------------------------------------------
// Empty — "Nothing in flight" (node 601:1814): a centered positive check medallion
// over a two-line copy block.
// ---------------------------------------------------------------------------

export function RailEmpty() {
  return (
    <div
      className="flex flex-col items-center gap-[0.625rem] pb-[2rem] pt-[2.75rem] text-center"
      data-rail-empty
    >
      <span className="flex size-[1.875rem] items-center justify-center rounded-full bg-diff-add/15">
        <Check size={15} aria-hidden className="text-diff-add" />
      </span>
      <p className="text-body font-medium text-ink-muted">Nothing in flight</p>
      <p className="text-meta text-ink-faint">
        No open plans, pull requests, or issues in this scope.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Degraded — "Running degraded" (node 609:2309): a caution dot beside a title +
// explanatory line. The dot rides a 1rem box so it aligns to the first text line.
// ---------------------------------------------------------------------------

export function RailDegraded() {
  return (
    <div
      className="flex items-start gap-[0.625rem] rounded-fg-md bg-paper-sunken p-fg-3"
      data-rail-degraded
      role="status"
    >
      <span className="flex h-fg-4 shrink-0 items-center">
        <span aria-hidden className="size-2 rounded-full bg-state-stale" />
      </span>
      <div className="flex flex-col gap-[0.1875rem]">
        <p className="text-label font-medium text-ink">Running degraded</p>
        <p className="text-meta text-ink-muted">
          Semantic search is offline — open items and history may be incomplete.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading — skeleton sections (node 601:1817): two stacks, each a short label bar
// over two card rows (dot + bar). Pulses unless reduced-motion is requested.
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <div className="flex items-center gap-fg-2 rounded-fg-sm border border-rule bg-paper-raised px-fg-2 py-[0.6875rem]">
      <span className="size-3 shrink-0 rounded-full bg-rule-strong" />
      <span className="h-2 flex-1 rounded-fg-xs bg-rule-strong" />
    </div>
  );
}

function SkeletonSection({ labelWidth }: { labelWidth: string }) {
  return (
    <div className="flex flex-col gap-fg-2">
      <span className={`h-[0.5625rem] rounded-fg-xs bg-rule-strong ${labelWidth}`} />
      <SkeletonRow />
      <SkeletonRow />
    </div>
  );
}

export function RailLoading() {
  return (
    <div
      className="flex flex-col gap-[1.125rem] pb-fg-2 pt-fg-4 motion-safe:animate-pulse-live"
      data-rail-loading
      role="status"
      aria-label="loading activity"
    >
      <SkeletonSection labelWidth="w-[5.25rem]" />
      <SkeletonSection labelWidth="w-[4.125rem]" />
    </div>
  );
}
