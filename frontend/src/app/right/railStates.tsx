// The activity rail's non-populated state bodies — now THIN WRAPPERS over the shared
// state-mode kit (state-mode-uniformity ADR D4/D6), uniform with the left rail and the
// canonical StateBlock/Skeleton: loading is a UI-only Skeleton (no text); degraded is the
// shared TriangleAlert caution in the stale tone (was a bespoke dot); empty is the shared
// glyph + one sentence (the positive Check for "nothing in flight"). The rail shares ONE
// LocationStrip header across every state and swaps this body underneath it.
//
// No wire access, no node identity: dumb presentational components over a state the
// stores selector already classified (dashboard-layer-ownership).

import { Check, Skeleton, SkeletonBar, SkeletonRow, StateBlock } from "../kit";

export type RailState = "populated" | "empty" | "degraded" | "loading";

/** Empty — "Nothing in flight": the positive settled state, shared glyph + one sentence. */
export function RailEmpty() {
  return (
    <StateBlock
      mode="empty"
      icon={Check}
      title="Nothing in flight"
      message="No open plans, pull requests, or issues in this scope."
    />
  );
}

/** Degraded — the shared caution mark (TriangleAlert, stale tone) + title + one sentence,
 *  uniform with every other surface (was a bespoke caution dot). */
export function RailDegraded() {
  return (
    <StateBlock
      mode="degraded"
      title="Running degraded"
      message="Semantic search is offline — open items and history may be incomplete."
    />
  );
}

/** Loading — UI-only skeleton mimicking the two card sections; no spinner, no copy. */
export function RailLoading() {
  return (
    <Skeleton label="loading activity" className="gap-[1.125rem] pb-fg-2 pt-fg-4">
      <div className="flex flex-col gap-fg-2">
        <SkeletonBar width="w-[5.25rem]" height="h-[0.5625rem]" />
        <SkeletonRow boxed />
        <SkeletonRow boxed />
      </div>
      <div className="flex flex-col gap-fg-2">
        <SkeletonBar width="w-[4.125rem]" height="h-[0.5625rem]" />
        <SkeletonRow boxed />
        <SkeletonRow boxed />
      </div>
    </Skeleton>
  );
}
