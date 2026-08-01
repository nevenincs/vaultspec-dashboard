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

/** The four canonical modes (state-mode-uniformity ADR D1). `typical` — NOT
 *  "populated": the ADR fixes one vocabulary used identically in Figma and code, and
 *  a second spelling for the same mode is how the two drift apart. */
export type RailState = "typical" | "empty" | "degraded" | "loading";

/** Empty — "Nothing in flight": the positive settled state, shared glyph + one sentence. */
export function RailEmpty() {
  const title = useLocalizedMessage({ key: "common:rail.states.emptyTitle" });
  const message = useLocalizedMessage({ key: "common:rail.states.emptyMessage" });
  return <StateBlock mode="empty" icon={Check} title={title} message={message} />;
}

/** Degraded — the shared caution mark (TriangleAlert, stale tone) centered over ONE
 *  sentence, at the SAME glyph size every other warning message uses. No title above
 *  it: a heading plus a sentence saying the same thing reads as two failures. */
export function RailDegraded() {
  const message = useLocalizedMessage({ key: "common:rail.states.degradedMessage" });
  return <StateBlock mode="degraded" message={message} />;
}

/** Loading — UI-only skeleton mimicking the two card sections; no spinner, no copy.
 *
 *  The ghost sits on the SAME grid the settled rail does: the eyebrow bar takes the
 *  section header's `px-fg-1` inset and the rows take that plus the body's own
 *  `px-fg-1` (RAIL_SECTION_HEADER_CLASS / RAIL_SECTION_BODY_CLASS), so nothing steps
 *  sideways when the data lands. The rows carry the card FOOTPRINT with no fill —
 *  a raised plate under a shimmer would read as settled content. */
export function RailLoading() {
  const label = useLocalizedMessage({ key: "common:rail.states.loadingActivity" });
  return (
    <Skeleton label={label} className="gap-[1.125rem] px-fg-1 pb-fg-2 pt-fg-4">
      <div className="flex flex-col gap-fg-2">
        <SkeletonBar width="w-[5.25rem]" height="h-[0.5625rem]" />
        <div className="flex flex-col gap-fg-2 px-fg-1 pt-fg-0-5">
          <SkeletonRow boxed />
          <SkeletonRow boxed />
        </div>
      </div>
      <div className="flex flex-col gap-fg-2">
        <SkeletonBar width="w-[4.125rem]" height="h-[0.5625rem]" />
        <div className="flex flex-col gap-fg-2 px-fg-1 pt-fg-0-5">
          <SkeletonRow boxed />
          <SkeletonRow boxed />
        </div>
      </div>
    </Skeleton>
  );
}
