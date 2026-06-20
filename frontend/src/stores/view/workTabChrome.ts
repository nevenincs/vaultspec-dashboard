export const WORK_ROVING_ATTR = "data-work-roving";

const GATE_PX = 14;

export interface WorkProgressRingView {
  label: string;
  radius: number;
  circumference: number;
  dash: number;
  center: number;
  rootClassName: string;
  svgClassName: string;
  trackClassName: string;
  arcClassName: string;
  textClassName: string;
}

export function deriveWorkProgressRingView(
  done: number,
  total: number,
): WorkProgressRingView {
  const radius = (GATE_PX - 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  const dash = circumference * fraction;
  const complete = total > 0 && done >= total;
  return {
    label: `${done} of ${total} steps complete`,
    radius,
    circumference,
    dash,
    center: GATE_PX / 2,
    rootClassName: "flex shrink-0 items-center gap-fg-1",
    svgClassName: "shrink-0",
    trackClassName: "stroke-rule",
    arcClassName: complete ? "stroke-state-complete" : "stroke-state-active",
    textClassName: "text-caption text-ink-muted",
  };
}

const WORK_STATUS_PILL_INK: Record<string, string> = {
  proposed: "border-state-stale/50 text-state-stale",
  accepted: "border-state-active/50 text-state-active",
  deprecated: "border-state-archived/60 text-ink-muted",
  rejected: "border-state-broken/50 text-state-broken",
};

export interface WorkStatusPillView {
  className: string;
  ariaLabel: string;
}

export function deriveWorkStatusPillView(status: string): WorkStatusPillView {
  const ink = WORK_STATUS_PILL_INK[status] ?? "border-rule text-ink-muted";
  return {
    className: `shrink-0 rounded-fg-pill border px-fg-1-5 py-px text-caption font-medium ${ink}`,
    ariaLabel: `status ${status}`,
  };
}

export const WORK_PIPELINE_ARC_PHASES = [
  "research",
  "adr",
  "plan",
  "execute",
  "review",
  "codify",
] as const;

export type WorkPipelineArcPhase = (typeof WORK_PIPELINE_ARC_PHASES)[number];

export interface WorkPipelineArcRow {
  phase: WorkPipelineArcPhase;
  occupied: boolean;
  ariaLabel: string;
  itemClassName: string;
  phaseClassName: string;
  dotClassName: string;
  separatorVisible: boolean;
  separatorClassName: string;
}

export interface WorkPipelineArcView {
  rootClassName: string;
  ariaLabel: string;
  rows: WorkPipelineArcRow[];
}

export function deriveWorkPipelineArcView(
  occupied: ReadonlySet<string>,
): WorkPipelineArcView {
  return {
    rootClassName:
      "flex items-center gap-fg-0-5 px-fg-1 py-fg-1 text-caption text-ink-faint",
    ariaLabel: "pipeline phases",
    rows: WORK_PIPELINE_ARC_PHASES.map((phase, index) => {
      const on = occupied.has(phase);
      return {
        phase,
        occupied: on,
        ariaLabel: on ? `${phase} (in flight)` : phase,
        itemClassName: "flex items-center gap-fg-0-5",
        phaseClassName: `inline-flex items-center gap-fg-0-5 ${
          on ? "font-medium text-ink" : ""
        }`,
        dotClassName: `inline-block size-fg-1 rounded-fg-pill ${
          on ? "bg-accent" : "bg-rule"
        }`,
        separatorVisible: index < WORK_PIPELINE_ARC_PHASES.length - 1,
        separatorClassName: "text-ink-faint",
      };
    }),
  };
}

export interface WorkPlanRowChromeView {
  rootClassName: string;
  controlsClassName: string;
  toggleClassName: string;
  rowButtonClassName: string;
  bodyClassName: string;
  headingClassName: string;
  titleClassName: string;
  tierClassName: string;
  metaClassName: string;
  treeClassName: string;
  tabIndex: 0 | -1;
}

export function deriveWorkPlanRowChrome(tabbable: boolean): WorkPlanRowChromeView {
  return {
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
    tabIndex: tabbable ? 0 : -1,
  };
}
