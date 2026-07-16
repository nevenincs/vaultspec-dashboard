import { describe, expect, it } from "vitest";

import {
  WORK_ROVING_ATTR,
  deriveWorkPipelineArcView,
  deriveWorkPlanRowChrome,
  deriveWorkProgressRingView,
  deriveWorkStatusPillView,
} from "./workTabChrome";

describe("workTabChrome projections", () => {
  it("projects progress-ring geometry and token classes", () => {
    const half = deriveWorkProgressRingView(2, 4);
    expect(half).toMatchObject({
      label: {
        key: "common:finalWave.work.progress",
        values: { count: 4, done: 2 },
      },
      rootClassName: "flex shrink-0 items-center gap-fg-1",
      svgClassName: "shrink-0",
      trackClassName: "stroke-rule",
      arcClassName: "stroke-state-active",
      textClassName: "text-caption text-ink-muted",
    });
    expect(half.dash).toBeCloseTo(half.circumference / 2);

    expect(deriveWorkProgressRingView(4, 4).arcClassName).toBe("stroke-state-complete");
  });

  it("projects status-pill tone without app-layer status maps", () => {
    expect(deriveWorkStatusPillView("accepted")).toEqual({
      className:
        "shrink-0 rounded-fg-pill border px-fg-1-5 py-px text-caption font-medium border-state-active/50 text-state-active",
    });
    expect(deriveWorkStatusPillView("unknown").className).toContain(
      "border-rule text-ink-muted",
    );
  });

  it("projects the canonical pipeline arc rows from occupied phases", () => {
    const arc = deriveWorkPipelineArcView(new Set(["adr", "execute"]));
    expect(arc.rootClassName).toBe(
      "flex items-center gap-fg-0-5 px-fg-1 py-fg-1 text-caption text-ink-faint",
    );
    expect(arc.rows.map((row) => row.phase)).toEqual([
      "research",
      "adr",
      "plan",
      "execute",
      "review",
      "codify",
    ]);
    expect(arc.rows[1]).toMatchObject({
      phase: "adr",
      occupied: true,
      phaseClassName: "inline-flex items-center gap-fg-0-5 font-medium text-ink",
      dotClassName: "inline-block size-fg-1 rounded-fg-pill bg-accent",
      separatorVisible: true,
    });
    expect(arc.rows.at(-1)?.separatorVisible).toBe(false);
  });

  it("projects plan row chrome and roving tab-stop attributes", () => {
    expect(WORK_ROVING_ATTR).toBe("data-work-roving");
    expect(deriveWorkPlanRowChrome(true)).toMatchObject({
      rootClassName: "space-y-fg-0-5",
      controlsClassName: "flex items-stretch gap-fg-0-5",
      toggleClassName:
        "flex shrink-0 items-center rounded-fg-xs px-fg-0-5 text-ink-faint transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      rowButtonClassName:
        "flex min-w-0 flex-1 items-center gap-fg-1-5 rounded-fg-xs border border-rule px-fg-2 py-fg-1 text-left transition-colors duration-ui-fast ease-settle hover:border-rule-strong hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      bodyClassName: "min-w-0 flex-1",
      headingClassName: "flex items-center gap-fg-1-5",
      titleClassName: "min-w-0 truncate text-body text-ink",
      tierClassName: "shrink-0",
      metaClassName: "mt-px flex items-center gap-fg-1-5 text-caption text-ink-faint",
      treeClassName: "pl-fg-4",
      tabIndex: 0,
    });
    expect(deriveWorkPlanRowChrome(false).tabIndex).toBe(-1);
  });
});
