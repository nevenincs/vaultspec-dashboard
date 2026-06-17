// @vitest-environment happy-dom
//
// The rag readiness rollup (W02.P15.S31) rendered against the REAL engine
// /status (the app client is bound to the live transport in liveSetup) — no mock.
//
// The degraded-tier warn state (mock.degrade) and the stream-recovery invalidation
// (mock.push a backends SSE frame + spy on invalidateQueries) are NOT exercised
// here: both need failure/SSE injection a healthy live engine won't produce, and
// the spy observed an internal. The SSE-frame parsing + the status-invalidation
// trigger logic are pure-tested in queries.test.ts (parseSseFrames / streamReducer
// / latestBackendsRagAvailable).

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { queryClient } from "../../stores/server/queryClient";
import { NowStrip } from "./NowStrip";

function ragCardEl(): HTMLElement {
  return document.querySelector('[data-card="rag"]') as HTMLElement;
}

function renderStrip() {
  render(createElement(QueryClientProvider, { client: queryClient }, createElement(NowStrip)));
}

describe("NowStrip rag rollup (live engine)", () => {
  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  it("renders the rag readiness receipt with a designed tone and legible copy", async () => {
    renderStrip();
    await waitFor(() => {
      const card = ragCardEl();
      expect(card).toBeTruthy();
      // Composite readiness is stated as one of the designed tones (never a bare
      // error), with non-empty receipt copy — whatever the live rag state is.
      expect(["ok", "warn", "error"]).toContain(card.getAttribute("data-tone"));
      expect((card.textContent ?? "").trim().length).toBeGreaterThan(0);
    });
  });
});
