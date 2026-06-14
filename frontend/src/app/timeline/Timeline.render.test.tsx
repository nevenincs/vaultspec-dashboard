// @vitest-environment happy-dom
//
// Event-mark a11y (timeline surface ADR "Keyboard contract, a11y": marks are
// focusable AND activatable; design review S28 MEDIUM): the individual event
// marks must expose their NATIVE button role so assistive tech announces each
// as an activatable control, not a plain list item. This test feeds the live
// wire shape through the real stores client transport (mockEngine) — no
// component-internal doubles — drives the timeline window into the raw-mark
// zone, and asserts each mark is reachable as a button by its accessible name
// AND that activating it fires the select intent.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { engineClient } from "../../stores/server/engine";
import type { EngineEvent } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { MockEngine, MOCK_SCOPE } from "../../testing/mockEngine";
import { Timeline, useTimelineStore } from "./Timeline";

// The mock corpus seeds its first feature's events at this instant; a 3-day
// window from here lands in the raw-mark zone (bucketForSpan === "raw") and
// contains the early doc-created events.
const CORPUS_BASE = Date.parse("2026-01-05T09:00:00Z");
const DAY = 24 * 3600 * 1000;

function renderTimeline(onEventClick?: (e: EngineEvent) => void) {
  return render(
    <QueryClientProvider client={queryClient}>
      <div style={{ position: "relative", width: "800px", height: "82px" }}>
        <Timeline onEventClick={onEventClick} />
      </div>
    </QueryClientProvider>,
  );
}

describe("Timeline event marks are activatable buttons (S28 MEDIUM)", () => {
  beforeEach(() => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    useViewStore.getState().setScope(MOCK_SCOPE);
    // A 3-day window from the corpus base → raw individual marks, not buckets.
    useTimelineStore
      .getState()
      .setWindow({ from: CORPUS_BASE, to: CORPUS_BASE + 3 * DAY });
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
    engineClient.useTransport((input, init) => fetch(input, init));
    vi.restoreAllMocks();
  });

  it("exposes each mark with its native button role and a descriptive name", async () => {
    renderTimeline();
    // Every mark is reachable as a BUTTON (not a listitem); the names spell the
    // kind, the human time, and the joined-node count.
    const marks = await screen.findAllByRole("button", {
      name: /at .* touching \d+ node/i,
    });
    expect(marks.length).toBeGreaterThan(0);
    // A concrete corpus mark resolves by its exact accessible name — proving the
    // native button role survives (a role="listitem" would have masked it).
    expect(
      screen.getByRole("button", {
        name: "document created at 2026-01-05 09:00, touching 2 nodes",
      }),
    ).toBeTruthy();
    // The group wrapper names the marks but does NOT override their button role.
    const group = screen.getByRole("group", { name: "timeline events" });
    expect(group.querySelector('[role="listitem"]')).toBeNull();
  });

  it("fires select intent when a mark button is activated", async () => {
    const clicked: EngineEvent[] = [];
    renderTimeline((e) => clicked.push(e));
    const mark = await screen.findByRole("button", {
      name: "document created at 2026-01-05 09:00, touching 2 nodes",
    });
    fireEvent.click(mark);
    await waitFor(() => expect(clicked.length).toBeGreaterThan(0));
    expect(clicked[0]?.id).toBeTruthy();
  });
});
