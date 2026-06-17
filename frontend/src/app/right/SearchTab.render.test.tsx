// @vitest-environment happy-dom
//
// Search surface adoption (W02.P08.S24): the SearchTab's full designed state
// machine — idle, loading, results, no-results, degraded (semantic search
// offline), and a genuine transport error — plus its keyboard contract and
// result-selection click-through, all exercised through the REAL stores client
// transport (mockEngine), with no component-internal doubles. The degraded state
// is driven by a real tiers block the engine serves on its error envelope,
// proving the surface renders rag-down as a designed state (read through the
// stores seam, never the raw tiers block) rather than a bare error. Selecting a
// result emits selectNode into the shared view store — the one model, addressed
// by stable node id (search ADR / views-are-projections).

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { engineKeys } from "../../stores/server/queries";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { MockEngine, MOCK_SCOPE } from "../../testing/mockEngine";
import { SearchTab } from "./SearchTab";

function renderSearch() {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(SearchTab),
    ),
  );
}

function type(value: string) {
  // The query input is the centralized kit SearchField (a text input, not a
  // native search box) carrying the "search query" accessible name.
  const field = screen.getByRole("textbox", { name: "search query" });
  fireEvent.change(field, { target: { value } });
  return field as HTMLInputElement;
}

describe("SearchTab surface states + a11y + selection (S24)", () => {
  beforeEach(() => {
    // Pin the active scope so useActiveScope resolves without the map/session
    // round-trip; the search + fallback queries then run against the mock.
    useViewStore.getState().setScope(MOCK_SCOPE);
    useViewStore.getState().select(null);
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
    useViewStore.getState().select(null);
    engineClient.useTransport((input, init) => fetch(input, init));
    vi.restoreAllMocks();
  });

  it("shows an approachable idle prompt before any query (not a blank panel)", () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderSearch();
    const idle = document.querySelector("[data-search-idle]");
    expect(idle?.textContent).toMatch(/select a result to focus it/i);
  });

  it("shows a liveness loading cue tied to a real in-flight query", async () => {
    // A transport that never resolves keeps the search query pending. The
    // controller debounces the keystroke stream, so the loading cue appears once
    // the term settles and the (never-resolving) request is in flight.
    engineClient.useTransport(() => new Promise<Response>(() => {}));
    renderSearch();
    type("auth");
    await waitFor(() => {
      const loading = document.querySelector("[data-search-loading]");
      expect(loading?.textContent).toMatch(/searching/i);
    });
  });

  it("lists results with a tabular score and a count receipt when the query settles", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderSearch();
    type("step");
    const list = await screen.findByRole("list", { name: "search results" });
    expect(list).toBeTruthy();
    // The quiet count receipt announces how many hits landed.
    await waitFor(() => {
      const count = document.querySelector("[data-search-count]");
      expect(count?.textContent).toMatch(/result/);
    });
    // The score readout carries tabular numerals (data-bearing).
    const scored = [...document.querySelectorAll("[data-tabular]")].find((el) =>
      /%/.test(el.textContent ?? ""),
    );
    expect(scored).toBeTruthy();
  });

  it("selecting a result emits selectNode into the shared view store (click-through by node id)", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderSearch();
    type("step");
    await screen.findByRole("list", { name: "search results" });
    const rows = await waitFor(() => {
      const found = screen
        .getAllByRole("button")
        .filter((b) => /relevance/i.test(b.getAttribute("aria-label") ?? ""));
      expect(found.length).toBeGreaterThan(0);
      return found;
    });
    expect(useViewStore.getState().selectedId).toBeNull();
    fireEvent.click(rows[0]);
    // The shared selection now holds a real node id — the projection over the
    // one model, reached by stable id (no surface-local navigation).
    expect(useViewStore.getState().selectedId).toBeTruthy();
  });

  it("moves result focus with ArrowDown/ArrowUp (roving-tabindex keyboard contract)", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderSearch();
    type("step");
    await screen.findByRole("list", { name: "search results" });
    const rows = await waitFor(() => {
      const found = screen
        .getAllByRole("button")
        .filter((b) => /relevance/i.test(b.getAttribute("aria-label") ?? ""));
      expect(found.length).toBeGreaterThan(1);
      return found;
    });
    rows[0].focus();
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1], { key: "ArrowUp" });
    expect(document.activeElement).toBe(rows[0]);
    // ArrowUp at the top edge clamps rather than wrapping or escaping.
    fireEvent.keyDown(rows[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(rows[0]);
  });

  it("shows a no-results message distinct from idle and degraded", async () => {
    // A transport serving zero results under a healthy semantic tier exercises
    // the no-results branch (distinct from idle, degraded, and error).
    engineClient.useTransport((input, init) => {
      const url = new URL(input, "http://mock.local");
      if (url.pathname.replace(/^\/api/, "") === "/search") {
        return Promise.resolve(
          new Response(
            JSON.stringify({ results: [], tiers: { semantic: { available: true } } }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }
      return fetch(input, init);
    });
    renderSearch();
    type("zzznomatch");
    await waitFor(() => {
      const empty = document.querySelector("[data-search-empty]");
      expect(empty?.textContent).toMatch(/no matches/i);
    });
    expect(document.querySelector("[data-search-idle]")).toBeNull();
    expect(document.querySelector("[data-semantic-offline]")).toBeNull();
  });

  it("renders a designed degraded notice (semantic offline) with the text-match fallback, not an error", async () => {
    const mock = new MockEngine();
    mock.degrade("semantic", "rag service down");
    engineClient.useTransport(mock.fetchImpl);
    renderSearch();
    type("auth");
    // The degraded notice is a designed, advisory state read through the tiers
    // seam — never the transport-error branch. The mock's rag-down 502 is a
    // transient status that the query retries once, so allow for the backoff.
    const notice = await waitFor(
      () => {
        const el = document.querySelector("[data-semantic-offline]");
        expect(el?.textContent).toMatch(/semantic search offline/i);
        return el;
      },
      { timeout: 4000 },
    );
    expect(notice).toBeTruthy();
    expect(document.querySelector("[data-search-error]")).toBeNull();
    // The fallback list renders text-match rows over the vault tree.
    await waitFor(
      () => {
        const tags = [...document.querySelectorAll("span")].filter((s) =>
          /text match/i.test(s.textContent ?? ""),
        );
        expect(tags.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });

  it("states plainly that the code target has no text fallback when semantic is offline", async () => {
    const mock = new MockEngine();
    mock.degrade("semantic", "rag service down");
    engineClient.useTransport(mock.fetchImpl);
    renderSearch();
    // Switch to the code target, then query.
    fireEvent.click(screen.getByRole("radio", { name: "code" }));
    type("auth");
    await waitFor(
      () => {
        const notice = document.querySelector("[data-semantic-offline]");
        expect(notice?.textContent).toMatch(/no code fallback/i);
      },
      { timeout: 4000 },
    );
  });

  it("renders a recoverable transport error with retry, distinct from degradation", async () => {
    // A non-ok response with NO tiers envelope is a transport-level failure —
    // the query errors, distinct from the degraded (tiers-bearing) state.
    engineClient.useTransport((input, init) => {
      const url = new URL(input, "http://mock.local");
      if (url.pathname.replace(/^\/api/, "") === "/search") {
        return Promise.resolve(new Response("boom", { status: 500 }));
      }
      return fetch(input, init);
    });
    renderSearch();
    type("auth");
    await waitFor(() => {
      const err = document.querySelector("[data-search-error]");
      expect(err?.textContent).toMatch(/search request failed/i);
    });
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
    // It is NOT the degraded state.
    expect(document.querySelector("[data-semantic-offline]")).toBeNull();
  });

  it("keeps the last-good results visible under the error banner on a transient refetch failure", async () => {
    // The first /search serves results; a refetch of the SAME query key then
    // fails with a tiers-less transport error. The ADR error state is
    // recoverable — held results must stay visible alongside the banner, not be
    // blanked (the hook returns the last successful `data.results`, not []).
    let failNow = false;
    engineClient.useTransport((input, init) => {
      const url = new URL(input, "http://mock.local");
      if (url.pathname.replace(/^\/api/, "") === "/search") {
        if (failNow) return Promise.resolve(new Response("boom", { status: 500 }));
        return Promise.resolve(
          new Response(
            JSON.stringify({
              results: [
                {
                  score: 0.8,
                  source: "held-result",
                  excerpt: "stays visible",
                  node_id: "doc:held-result",
                },
              ],
              tiers: { semantic: { available: true } },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }
      return fetch(input, init);
    });
    renderSearch();
    type("auth");
    // The first query settles with the held result.
    expect(await screen.findByRole("button", { name: /held-result/i })).toBeTruthy();
    // Now refetch the SAME key against a failing transport — the held data is
    // retained on the key by TanStack across the error.
    failNow = true;
    await queryClient
      .refetchQueries({ queryKey: engineKeys.search("auth", "vault") })
      .catch(() => undefined);
    // The error banner appears AND the held result is still on screen.
    await waitFor(() => {
      expect(document.querySelector("[data-search-error]")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /held-result/i })).toBeTruthy();
  });

  it("clears the query through the kit SearchField clear affordance", () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderSearch();
    const field = type("auth");
    expect(field.value).toBe("auth");
    fireEvent.click(screen.getByRole("button", { name: "clear search" }));
    expect(field.value).toBe("");
  });
});
