import type { DashboardTimelineMode } from "./engine";

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
