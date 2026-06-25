// @vitest-environment happy-dom
//
// NodeInterior state-mode rendering (state-mode-uniformity ADR): the open-in-place
// interior's loading branches render the shared UI-only Skeleton — the human sentence
// is the screen-reader label ONLY, never visible body copy — and an unavailable
// interior reads as the shared degraded StateBlock (one glyph + one plain sentence).
// These assertions exercise the composed kit structure, mirroring the
// PlanStepTree.render.test.tsx loading pattern (no broken-run baselines).

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { queryClient } from "../../stores/server/queryClient";
import { NodeInterior } from "./NodeInterior";

afterEach(cleanup);

function renderInterior(id: string, scope: string | null) {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(NodeInterior, { id, scope }),
    ),
  );
}

describe("NodeInterior state modes (state-mode-uniformity ADR)", () => {
  it("renders a UI-only skeleton while a node detail is pending (no on-screen text)", () => {
    // An addressable doc id + a scope enables the detail query; on the first render
    // it is pending, so the loading branch renders the shared Skeleton.
    const { container } = renderInterior("doc:does-not-exist-pending", "main");

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    // The message is the screen-reader label ONLY — never visible body copy (ADR D2).
    const srOnly = container.querySelector(".sr-only");
    expect(srOnly?.textContent).toContain("unfolding");
    const visible = (status.textContent ?? "")
      .replace(srOnly?.textContent ?? "", "")
      .trim();
    expect(visible).toBe("");
    // Pure shape: skeleton bars, no text glyph.
    expect(container.querySelectorAll(".bg-rule-strong").length).toBeGreaterThan(1);
  });
});
