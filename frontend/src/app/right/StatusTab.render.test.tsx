// @vitest-environment happy-dom
//
// The activity rail's two structural promises, both from owner review of the
// rendered states:
//   • EMPTY IS EMPTY — when nothing is in flight the rail states that once and
//     shows nothing else. Section folds that would open onto nothing are not
//     rendered at all, so the rail never offers a disclosure it cannot honour.
//   • THE PLAN PILL IS THE DISCLOSURE — the whole row toggles its step tree, with
//     real button semantics (aria-expanded / aria-controls), and opening the plan
//     keeps its own named affordance beside it.
//
// Both are pure view contracts: no wire, no seeded cache, no engine double — the
// views take the state they render (railState, a resolved plan row view) as props.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { queryClient } from "../../stores/server/queryClient";
import type { PipelinePlanRowView } from "../../stores/server/queries";
import { PlanPill, StatusTabView } from "./StatusTab";

afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe("StatusTabView (rail modes)", () => {
  it("renders the empty rail ALONE — never the section folds behind it", () => {
    const { container } = render(
      <StatusTabView railState="empty">
        <section data-fold data-section>
          OPEN PLANS
        </section>
      </StatusTabView>,
    );

    expect(container.querySelector('[data-state-block="empty"]')).toBeTruthy();
    expect(container.querySelector("[data-fold]")).toBeNull();
    expect(screen.queryByText("OPEN PLANS")).toBeNull();
  });

  it("states the degraded read once, with no title stacked over the sentence", () => {
    const { container } = render(<StatusTabView railState="degraded" />);

    const block = container.querySelector('[data-state-block="degraded"]')!;
    expect(screen.getByText("Could not load status.")).toBeTruthy();
    // One sentence: the block carries exactly the message paragraph.
    expect(block.querySelectorAll("p")).toHaveLength(1);
  });

  it("renders the typical body only in the typical mode", () => {
    render(
      <StatusTabView railState="typical">
        <section data-fold>OPEN PLANS</section>
      </StatusTabView>,
    );

    expect(screen.getByText("OPEN PLANS")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PlanPill — the row IS the disclosure.
// ---------------------------------------------------------------------------

const PLAN_ROW: PipelinePlanRowView = {
  artifact: {
    node_id: "plan:2026-07-30-review-harness",
    stem: "2026-07-30-review-harness-plan",
    title: "Review harness plan",
    doc_type: "plan",
    tier: "L2",
    progress: { done: 5, total: 9 },
    feature_tags: ["review-harness"],
    dates: { created: "2026-07-20", modified: "2026-07-29" },
    phase: "execute",
  },
  nodeId: "plan:2026-07-30-review-harness",
  titleLabel: "Review harness plan",
  modifiedAt: "2026-07-29",
  phaseLabel: "execute",
  tierLabel: "L2",
  tierAriaLabel: {
    key: "common:finalWave.pipeline.tier",
    values: { level: "L2" },
  },
  openAriaLabel: {
    key: "common:finalWave.pipeline.openPlan",
    values: { title: "Review harness plan" },
  },
  selectAriaLabel: "select plan Review harness plan on the stage",
  showProgress: true,
  progressDone: 5,
  progressTotal: 9,
  progressTextLabel: "5/9",
  progressLabel: {
    key: "common:finalWave.pipeline.planCompletion",
    values: { title: "Review harness plan" },
  },
  progressPercentLabel: "56%",
  toggleLabel: (expanded) => ({
    key: expanded
      ? "common:finalWave.pipeline.collapseSteps"
      : "common:finalWave.pipeline.expandSteps",
    values: { title: "Review harness plan" },
  }),
};

function renderPill(expanded: boolean, onToggle: () => void) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ul>
        <PlanPill
          row={PLAN_ROW}
          now={Date.parse("2026-07-30T00:00:00Z")}
          expanded={expanded}
          className=""
          selectedValue={undefined}
          isTimeTravel={false}
          onToggle={onToggle}
        />
      </ul>
    </QueryClientProvider>,
  );
}

describe("PlanPill (the whole row toggles its step tree)", () => {
  it("toggles from a click anywhere on the pill row, with disclosure semantics", () => {
    let toggles = 0;
    const { container } = renderPill(false, () => {
      toggles += 1;
    });

    const row = container.querySelector<HTMLButtonElement>("[data-open-plan-row]")!;
    expect(row.tagName).toBe("BUTTON");
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(row.getAttribute("aria-controls")).toBe(
      "status-tree-plan:2026-07-30-review-harness",
    );
    // The row is the whole line: twisty AND title live inside the one control.
    expect(row.textContent).toContain("Review harness plan");

    fireEvent.click(row);
    expect(toggles).toBe(1);
  });

  it("reports itself expanded and keeps a named affordance for opening the plan", () => {
    const { container } = renderPill(true, () => {});

    const row = container.querySelector<HTMLButtonElement>("[data-open-plan-row]")!;
    expect(row.getAttribute("aria-expanded")).toBe("true");

    const open = container.querySelector<HTMLButtonElement>("[data-open-plan-open]")!;
    expect(open.getAttribute("aria-label")).toContain("Review harness plan");
    // The row holds the list's single tab stop; the open control rides along.
    expect(open.tabIndex).toBe(-1);
  });
});
