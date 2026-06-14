// @vitest-environment happy-dom
//
// The stream-transition recovery effect (finding 029): backend/git SSE
// chunks must invalidate the /status snapshot — stream is delta, /status
// is recovery (contract §7).

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { engineKeys } from "../../stores/server/queries";
import { queryClient } from "../../stores/server/queryClient";
import { MockEngine } from "../../testing/mockEngine";
import { NowStrip } from "./NowStrip";

function ragCardEl(): HTMLElement {
  return document.querySelector('[data-card="rag"]') as HTMLElement;
}

function renderStrip(configure?: (mock: MockEngine) => void) {
  const mock = new MockEngine();
  configure?.(mock);
  engineClient.useTransport(mock.fetchImpl);
  render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(NowStrip),
    ),
  );
  return mock;
}

describe("NowStrip rag rollup states (W02.P15.S31)", () => {
  afterEach(() => {
    cleanup();
    queryClient.clear();
    engineClient.useTransport((input, init) => fetch(input, init));
    vi.restoreAllMocks();
  });

  it("renders rag readiness as a legible receipt (running + index + watcher)", async () => {
    renderStrip();
    await waitFor(() => {
      const card = ragCardEl();
      expect(card).toBeTruthy();
      // Composite readiness is stated plainly; the snapshot serves a fresh
      // index, a live watcher, and zero jobs.
      expect(card.getAttribute("data-tone")).toBe("ok");
      expect(card.textContent).toContain("ready");
      expect(card.textContent).toContain("index fresh");
      expect(card.querySelector("[data-rag-jobs]")?.textContent).toContain("0 jobs");
    });
  });

  it("renders a degraded semantic tier as a designed warn state, not an error", async () => {
    renderStrip((mock) => mock.degrade("semantic", "model loading"));
    await waitFor(() => {
      const card = ragCardEl();
      expect(card.getAttribute("data-tone")).toBe("warn");
      // Honest degraded copy carrying the engine's own reason — never a bare
      // error and never the stopped/absent wording.
      expect(card.textContent).toContain("model loading");
    });
  });
});

describe("NowStrip stream recovery (029)", () => {
  afterEach(() => {
    cleanup();
    queryClient.clear();
    engineClient.useTransport((input, init) => fetch(input, init));
    vi.restoreAllMocks();
  });

  it("invalidates the status snapshot when a backends transition arrives", async () => {
    const mock = new MockEngine();
    engineClient.useTransport(mock.fetchImpl);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(NowStrip),
      ),
    );
    // Push a live backend transition, then let the debounce window settle
    // before asserting (the invalidation now coalesces, P-HIGH-2). The
    // inter-attempt wait exceeds the 150ms debounce so each push gets its own
    // settle even though the stream subscribes asynchronously.
    await waitFor(
      async () => {
        mock.push("backends", { rag: "stopped" });
        await new Promise((resolve) => setTimeout(resolve, 170));
        expect(invalidate).toHaveBeenCalledWith({ queryKey: engineKeys.status() });
      },
      { timeout: 3000 },
    );
  });
});
