import type { DashboardTimelineMode } from "./engine";

// TTR-005 disposition (2026-07-02, see
// .vault/audit/2026-07-02-timeline-temporal-review-audit.md): time-travel ENTRY
// was retired after the Issue #14 timeline rebuild removed the scrolling
// playhead. This mode grammar plus the movePlayhead / patchDashboardTimelineMode
// write seam are deliberately KEPT (not deleted) so a persisted time-travel mode
// still heals to live on load and the capability stays reversible. RE-ENTRY
// (option a): add a deliberate "view corpus at this commit" entry writer against
// this grammar — the engine /graph/asof + /graph/diff wire is intact and bounded,
// so nothing else needs to change to restore time travel.

export type DashboardPlayhead = number | "live";

export function dashboardTimelineModeForPlayhead(
  playhead: DashboardPlayhead,
): DashboardTimelineMode {
  if (playhead === "live") return { kind: "live" };
  if (!Number.isFinite(playhead)) {
    throw new Error("dashboard playhead must be a finite millisecond timestamp");
  }
  return { kind: "time-travel", at: Math.round(playhead) };
}

export function dashboardPlayheadForTimelineMode(
  mode: DashboardTimelineMode | undefined,
): DashboardPlayhead {
  return mode?.kind === "time-travel" ? mode.at : "live";
}
