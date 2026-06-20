// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { PlanInteriorView } from "../../stores/server/queries";
import { PlanStepTree } from "./PlanStepTree";

afterEach(cleanup);

const emptyView: PlanInteriorView = {
  loading: false,
  served: true,
  empty: true,
  waves: [],
  phases: [],
  steps: [],
  hasUngroupedSteps: false,
  rollup: { done: 0, total: 0 },
  truncated: null,
  loadingMessage: "loading steps...",
  placeholderMessage: "step tree pending - the plan interior is not yet served.",
  emptyMessage: "no steps in this plan yet.",
  listAriaLabel: "plan steps",
  truncatedMessage: null,
};

describe("PlanStepTree", () => {
  it("renders a live loading state while the bounded interior is pending", () => {
    render(<PlanStepTree view={{ ...emptyView, loading: true }} />);

    expect(screen.getByRole("status").textContent).toContain("loading steps");
  });

  it("renders an empty designed state for plans without interior steps", () => {
    render(<PlanStepTree view={emptyView} />);

    expect(screen.getByText("no steps in this plan yet.")).toBeTruthy();
  });

  it("renders the honest bounded-truncation message", () => {
    render(
      <PlanStepTree
        view={{
          ...emptyView,
          empty: false,
          phases: [
            {
              node_id: "phase:one",
              id: "P1",
              steps: [],
              rollup: { done: 0, total: 0 },
            },
          ],
          truncated: { returned_nodes: 40, total_nodes: 90, reason: "node ceiling" },
          truncatedMessage:
            "showing 40 of 90 nodes - this plan exceeds the interior ceiling; open it on the stage to see the full tree.",
        }}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("showing 40 of 90");
  });
});
