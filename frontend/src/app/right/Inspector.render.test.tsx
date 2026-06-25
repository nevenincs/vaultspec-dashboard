// @vitest-environment happy-dom
//
// Inspector state-mode rendering (state-mode-uniformity ADR): the right-rail inspector
// renders its non-typical modes through the shared kit — loading is the UI-only Skeleton
// (the human sentence is the screen-reader label ONLY, never visible body copy), and the
// no-selection state reads as the shared empty StateBlock (one glyph + one plain sentence).
// Driven against the live engine (mock-mirrors-live-wire-shape) the way the sibling
// right-rail render tests are; the loading assertion reads the first, pending render
// (no broken-run baselines), mirroring PlanStepTree.render.test.tsx.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { dashboardDocumentStateResetPatch } from "../../stores/server/dashboardState";
import type { EngineNode } from "../../stores/server/engine";
import { engineKeys } from "../../stores/server/queries";
import { queryClient } from "../../stores/server/queryClient";
import { selectNode } from "../../stores/view/selection";
import { useViewStore } from "../../stores/view/viewStore";
import { createLiveClient, liveScope } from "../../testing/liveClient";
import { Inspector } from "./Inspector";

function renderInspector() {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(Inspector),
    ),
  );
}

async function realDocumentNode(scope: string): Promise<EngineNode> {
  const slice = await createLiveClient().graphQuery({ scope, granularity: "document" });
  const node = slice.nodes.find((entry) => entry.id.startsWith("doc:"));
  if (!node) {
    throw new Error("live Inspector test fixture has no document node");
  }
  return node;
}

let scope: string;
let node: EngineNode;

beforeAll(async () => {
  scope = await liveScope();
  node = await realDocumentNode(scope);
});

beforeEach(async () => {
  queryClient.clear();
  useViewStore.getState().setScope(scope);
  await createLiveClient().patchDashboardState(dashboardDocumentStateResetPatch(scope));
});

afterEach(async () => {
  cleanup();
  queryClient.clear();
  await createLiveClient()
    .patchDashboardState(dashboardDocumentStateResetPatch(scope))
    .catch(() => undefined);
});

afterAll(() => {
  useViewStore.getState().setScope(null);
});

describe("Inspector state modes (state-mode-uniformity ADR)", () => {
  it("renders the shared empty StateBlock when nothing is selected", () => {
    const { container } = renderInspector();

    const block = container.querySelector('[data-state-block="empty"]');
    expect(block).toBeTruthy();
    expect(block?.textContent).toContain("select something to inspect");
  });

  it("renders a UI-only skeleton while the selected node detail is pending (no on-screen text)", async () => {
    // Drive a real selection and let the inspector converge off its empty state,
    // so the resolved-selection (dashboard-state) read is cached and resolves
    // synchronously on the next render.
    await selectNode(node.id, scope);
    const first = renderInspector();
    await waitFor(() =>
      expect(first.container.querySelector('[data-state-block="empty"]')).toBeNull(),
    );
    cleanup();

    // Evict ONLY the node-detail query: selection stays resolved, but the detail
    // read is pending again — the deterministic loading branch.
    queryClient.removeQueries({ queryKey: engineKeys.node(scope, node.id) });

    const { container } = renderInspector();

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    // The message is the screen-reader label ONLY — never visible body copy (ADR D2).
    const srOnly = container.querySelector(".sr-only");
    expect(srOnly?.textContent).toContain("inspecting");
    const visible = (status.textContent ?? "")
      .replace(srOnly?.textContent ?? "", "")
      .trim();
    expect(visible).toBe("");
    // Pure shape: skeleton bars.
    expect(container.querySelectorAll(".bg-rule-strong").length).toBeGreaterThan(2);
  });
});
