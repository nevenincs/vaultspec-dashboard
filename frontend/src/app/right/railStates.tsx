// The activity rail's non-populated state bodies — now THIN WRAPPERS over the shared
// state-mode kit (state-mode-uniformity ADR D4/D6), uniform with the left rail and the
// canonical StateBlock/Skeleton: loading is a UI-only Skeleton (no text); degraded is the
// shared TriangleAlert caution in the stale tone (was a bespoke dot); empty is the shared
// glyph + one sentence (the positive Check for "nothing in flight"). Location identity
// lives only in the left rail's switcher trigger (worktree-switcher-identity ADR).
//
// No wire access, no node identity: dumb presentational components over a state the
// stores selector already classified (dashboard-layer-ownership).

import { Check, Skeleton, SkeletonBar, SkeletonRow, StateBlock } from "../kit";
import { useLocalizedMessage } from "../../platform/localization/LocalizationProvider";

export type RailState = "populated" | "empty" | "degraded" | "loading";

/** Empty — "Nothing in flight": the positive settled state, shared glyph + one sentence. */
export function RailEmpty() {
  const title = useLocalizedMessage({ key: "common:rail.states.emptyTitle" });
  const message = useLocalizedMessage({ key: "common:rail.states.emptyMessage" });
  return <StateBlock mode="empty" icon={Check} title={title} message={message} />;
}

/** Degraded — the shared caution mark (TriangleAlert, stale tone) + title + one sentence,
 *  uniform with every other surface (was a bespoke caution dot). */
export function RailDegraded() {
  const title = useLocalizedMessage({ key: "common:rail.states.degradedTitle" });
  const message = useLocalizedMessage({ key: "common:rail.states.degradedMessage" });
  return <StateBlock mode="degraded" title={title} message={message} />;
}

/** Loading — UI-only skeleton mimicking the two card sections; no spinner, no copy. */
export function RailLoading() {
  const label = useLocalizedMessage({ key: "common:rail.states.loadingActivity" });
  return (
    <Skeleton label={label} className="gap-[1.125rem] pb-fg-2 pt-fg-4">
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
