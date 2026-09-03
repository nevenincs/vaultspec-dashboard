// The left rail's DESIGNED transient/empty/degraded modes (binding `LeftRail` State
// collection: Typical / Loading / Empty / Degraded). These are now THIN WRAPPERS over
// the shared state-mode kit (state-mode-uniformity ADR D4/D6): the rail composes the one
// canonical `Skeleton` / `StateBlock` so its loading is UI-only (no text), its
// degraded/empty are the shared glyph + one sentence, and its pulse/tone/glyph match
// every other surface — the rail is the reference USING the kit, not a parallel copy.
//
// No wire access, no node identity: pure presentation over a state the stores selector
// already classified (dashboard-layer-ownership / ui-labels-are-user-facing).

import type { LucideIcon } from "lucide-react";

import { Skeleton, SkeletonBar, SkeletonRow, StateBlock } from "../kit";

/** LOADING — UI-only skeleton mimicking the rail's section-eyebrow + folder-row rhythm.
 *  No spinner, no "reading…" copy: the label is screen-reader-only (ADR D2). */
/** The placeholder rows a loading TREE shows.
 *
 *  A tree's skeleton has to read as a tree: flat equal-length bars promise a list
 *  and then rearrange themselves into an indented hierarchy when the data lands,
 *  which is exactly the jolt a skeleton exists to prevent. Each row carries the
 *  depth it will have, indented on the SAME 0.75rem step the real rows use, so the
 *  placeholder occupies the shape its content will occupy. */
const RAIL_SKELETON_ROWS: readonly {
  readonly width: string;
  readonly depth: number;
}[] = [
  { width: "w-[38%]", depth: 0 },
  { width: "w-[62%]", depth: 1 },
  { width: "w-[54%]", depth: 1 },
  { width: "w-[70%]", depth: 2 },
  { width: "w-[46%]", depth: 0 },
];

export function RailSkeleton({ label }: { label: string }) {
  return (
    <Skeleton label={label} className="px-fg-1 py-fg-1">
      <SkeletonBar width="w-1/4" height="h-[0.625rem]" />
      {RAIL_SKELETON_ROWS.map((row, i) => (
        <div key={i} style={{ paddingLeft: `${row.depth * 0.75}rem` }}>
          <SkeletonRow width={row.width} />
        </div>
      ))}
    </Skeleton>
  );
}

/** EMPTY / DEGRADED full-body mode: a centered shared glyph over ONE plain sentence
 *  (ADR D3). `degraded` paints the caution mark in the stale tone; `empty` a neutral
 *  glyph. A caller may override the glyph with another sanctioned-family mark. */
export function RailMessage({
  tone,
  label,
  icon,
}: {
  tone: "empty" | "degraded";
  label: string;
  icon?: LucideIcon;
}) {
  return <StateBlock mode={tone} icon={icon} message={label} />;
}

/** DEGRADED inline notice: the compact "showing what loaded" variant — a caution row
 *  above partial content. One plain sentence, never the raw tier reason (ADR D3). */
export function RailDegradedNotice({ label }: { label: string }) {
  return <StateBlock mode="degraded" layout="inline" message={label} />;
}
