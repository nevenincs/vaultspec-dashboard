// @vitest-environment happy-dom
//
// The recodified node interior (W02.P09.S25), exercised through the REAL stores
// client transport (mockEngine) — no component-internal doubles. Asserts the
// instrument-grammar realization the node-canvas ADR requires: a feature unfolds
// into its lifecycle axis, a plan into its tiered steps, and a detail-fetch
// failure renders the CONTAINED "interior unavailable" state on that island
// (never a canvas-wide error), with a non-color icon cue.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { MOCK_SCOPE, MockEngine } from "../../testing/mockEngine";
import { useViewStore } from "../../stores/view/viewStore";
import { NodeInterior } from "./NodeInterior";

function renderInterior(id: string) {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      <NodeInterior id={id} />,
    ),
  );
}

describe("NodeInterior recodification (instrument grammar + contained failure)", () => {
  beforeEach(() => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    // A feature interior unfolds from the feature-filtered DOCUMENT slice, which
    // is scope-bound — set the active scope the way the worktree picker would, so
    // the slice query resolves against the mock corpus.
    useViewStore.getState().setScope(MOCK_SCOPE);
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("renders the contained interior-unavailable state for an unknown node", async () => {
    // The mock 404s a node absent from the corpus — the detail query errors.
    renderInterior("doc:does-not-exist");
    await waitFor(() => {
      const err = document.querySelector("[data-interior-error]");
      expect(err).toBeTruthy();
      expect(err?.textContent).toContain("interior unavailable");
      // Contained, status-role, not thrown to a canvas-wide boundary.
      expect(err?.getAttribute("role")).toBe("status");
    });
  });

  it("unfolds a feature along the canonical lifecycle axis", async () => {
    renderInterior("feature:editor-demo");
    await waitFor(() => {
      const axis = document.querySelector("[data-lifecycle-axis]");
      expect(axis).toBeTruthy();
      // Lifecycle docs are clickable entries into the shared selection.
      const entries = axis?.querySelectorAll("button");
      expect(entries?.length ?? 0).toBeGreaterThan(0);
    });
    // The canonical axis order leads with research and ends with audit.
    const axis = document.querySelector("[data-lifecycle-axis]");
    const kinds = Array.from(axis?.querySelectorAll("button") ?? []).map((b) =>
      b.textContent?.trim(),
    );
    expect(kinds[0]).toBe("research");
    expect(kinds.at(-1)).toBe("audit");
  });

  it("unfolds a plan into its tiered steps with check state and tabular progress", async () => {
    renderInterior("doc:2026-01-05-editor-demo-plan");
    await waitFor(() => {
      expect(document.querySelector("[data-plan-interior]")).toBeTruthy();
    });
    const interior = document.querySelector("[data-plan-interior]");
    // Progress counts are tabular numerals (data-bearing typography law).
    expect(interior?.querySelectorAll("[data-tabular]").length).toBeGreaterThanOrEqual(
      2,
    );
    // Steps are real, clickable, pressed-state buttons (done vs not).
    const steps = interior?.querySelectorAll("button[aria-pressed]");
    expect(steps?.length ?? 0).toBeGreaterThan(0);
  });
});
