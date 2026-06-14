// @vitest-environment happy-dom
//
// Time-travel mode honesty (timeline surface ADR "Time-travel honesty is
// enforced and unmistakable"; product invariant "time-travel as an enforced,
// unmistakable mode"): the playhead surface must make the mode obvious AND
// honest to assistive tech. These tests exercise the three real states through
// the shared mode + the stores degradation layer — no component-internal
// doubles — and assert the slider value text, the non-visual mode region, and
// the RECONNECTING degradation render. The mode is read from the SHARED
// timelineMode (the single truth that also drives the stage tint and ops-
// disable), never from per-surface guesswork.

import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { MockEngine } from "../../testing/mockEngine";
import { useDegradationStore } from "../degradation/matrix";
import { Playhead, movePlayhead } from "./Playhead";
import { useTimelineStore } from "./Timeline";

function renderPlayhead() {
  // The playhead positions itself absolutely off its parent, so give it a sized
  // host (mirroring the timeline footer).
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        "div",
        { style: { position: "relative", width: "800px", height: "82px" } },
        createElement(Playhead),
      ),
    ),
  );
}

describe("Playhead time-travel mode honesty + degradation (S28)", () => {
  beforeEach(() => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    movePlayhead("live");
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    movePlayhead("live");
    useDegradationStore.getState().clearOverrides();
    engineClient.useTransport((input, init) => fetch(input, init));
    vi.restoreAllMocks();
  });

  it("renders the slider in LIVE with a LIVE value text and a live status announcement", () => {
    renderPlayhead();
    const slider = screen.getByRole("slider", { name: "playhead" });
    expect(slider.getAttribute("aria-valuetext")).toBe("LIVE");
    // The non-visual mode region states LIVE honestly to assistive tech.
    const mode = document.querySelector("[data-playhead-mode]");
    expect(mode?.textContent).toMatch(/live/i);
    expect(mode?.getAttribute("role")).toBe("status");
  });

  it("flips the slider AND the non-visual region into time-travel when scrubbed off LIVE", () => {
    renderPlayhead();
    // Drive the SHARED mode off LIVE — the same single truth the stage reads.
    const at = useTimelineStore.getState().window.from + 3600_000;
    act(() => movePlayhead(at));
    expect(useViewStore.getState().timelineMode).toEqual({ kind: "time-travel", at });

    const slider = screen.getByRole("slider", { name: "playhead" });
    // The value text names the concrete instant (human time), not "LIVE".
    expect(slider.getAttribute("aria-valuetext")).not.toBe("LIVE");
    expect(slider.getAttribute("aria-valuetext")).toMatch(/\d{4}-\d{2}-\d{2}/);
    // The slider's value now sits at the scrubbed instant, between min and now.
    expect(Number(slider.getAttribute("aria-valuenow"))).toBe(Math.round(at));

    // Mode honesty for assistive tech: the live region declares time-travel AND
    // that operational actions are disabled (the enforced-mode contract).
    const mode = document.querySelector("[data-playhead-mode]");
    expect(mode?.textContent).toMatch(/time travel active/i);
    expect(mode?.textContent).toMatch(/disabled/i);
  });

  it("renders RECONNECTING as a designed degraded state, never an error", async () => {
    renderPlayhead();
    // Lose the stream through the stores degradation layer (the surface reads it
    // pre-derived; it never touches the raw tiers block).
    useDegradationStore.getState().setOverride("streamLost", true);
    await waitFor(() => {
      const live = document.querySelector("[data-playhead-live]");
      expect(live?.textContent).toMatch(/reconnecting/i);
    });
    // It is NOT an error: no alert role is raised on the playhead.
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
