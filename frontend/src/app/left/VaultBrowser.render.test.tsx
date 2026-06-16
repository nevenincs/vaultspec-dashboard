// @vitest-environment happy-dom
//
// Sidebar surface adoption (W02.P05.S21): the vault browser's FOUR honest
// states (loading, empty, degraded, error) and its keyboard / a11y contract,
// exercised through the real stores client transport (mockEngine) — no
// component-internal doubles. The degraded state is driven by a real tiers
// block the engine serves, proving the surface renders degradation as a
// designed state rather than a bare error, read through the stores selector
// and never the raw tiers block.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { MockEngine, MOCK_SCOPE } from "../../testing/mockEngine";
import { VaultBrowser } from "./VaultBrowser";

function renderBrowser() {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(VaultBrowser),
    ),
  );
}

describe("VaultBrowser surface states + a11y (S21)", () => {
  beforeEach(() => {
    // Pin the active scope synchronously so useActiveScope resolves without the
    // map/session round-trip; the vault-tree query then runs against the mock.
    useViewStore.getState().setScope(MOCK_SCOPE);
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
    engineClient.useTransport((input, init) => fetch(input, init));
    vi.restoreAllMocks();
  });

  it("renders a quiet copy-toned loading line while the tree is in flight", () => {
    // A transport that never resolves keeps the query pending.
    engineClient.useTransport(() => new Promise<Response>(() => {}));
    renderBrowser();
    const pending = screen.getByRole("status");
    expect(pending.textContent).toMatch(/reading the vault/i);
  });

  it("lists grouped rows under a labelled navigation landmark when the tree loads", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderBrowser();
    const nav = await screen.findByRole("navigation", { name: "vault browser" });
    expect(nav).toBeTruthy();
    // Flat sections (binding `LeftRail` 244:750): each group is a quiet
    // SectionLabel eyebrow over its rows — no disclosure controls. The landmark
    // lists navigable rows, each carrying its `.vault/` path as title.
    await waitFor(() => {
      const rows = screen
        .getAllByRole("button")
        .filter((b) => b.getAttribute("title")?.startsWith(".vault/"));
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  it("shows an approachable empty state for a scope with no vault documents", async () => {
    const mock = new MockEngine();
    mock.setNoVault(true);
    engineClient.useTransport(mock.fetchImpl);
    renderBrowser();
    await waitFor(() => {
      const empty = document.querySelector("[data-vault-empty]");
      expect(empty?.textContent).toMatch(/no vault documents/i);
    });
  });

  it("renders a designed degraded banner (with reason) when a tier is down, still listing what loaded", async () => {
    const mock = new MockEngine();
    mock.degrade("semantic", "rag service down");
    engineClient.useTransport(mock.fetchImpl);
    renderBrowser();
    await waitFor(() => {
      const banner = document.querySelector("[data-vault-degraded]");
      expect(banner).toBeTruthy();
      expect(banner?.textContent).toMatch(/rag service down/);
    });
    // Degradation is NOT an error: the tree still rendered its rows.
    expect(screen.queryByText(/vault tree unavailable/i)).toBeNull();
    expect(screen.getByRole("navigation", { name: "vault browser" })).toBeTruthy();
  });

  it("renders a contained error with a retry control on a genuine read failure", async () => {
    // A non-ok response with no tiers envelope is a transport-level failure —
    // the query errors, distinct from degradation.
    engineClient.useTransport(() =>
      Promise.resolve(new Response("boom", { status: 500 })),
    );
    renderBrowser();
    await waitFor(() => {
      expect(screen.getByText(/vault tree unavailable/i)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });

  // F-M2 degradation-honesty: a FAILED request whose error envelope carries a
  // tiers block reporting a tier down is DEGRADATION, not a transport error.
  // The designed degraded banner must win over the generic error banner; a
  // failure with NO tiers must still render the error banner.
  it("renders the degraded banner (not the error banner) when a tiers-bearing failure reports a tier down", async () => {
    // A non-ok response whose body carries a tiers block with a tier marked
    // unavailable — a backend tier is down, the engine answered the failure
    // truthfully. EngineError.tiers is defined, so availability.degraded is true.
    engineClient.useTransport(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ok: false,
            error: "structural tier down",
            tiers: {
              structural: { available: false, reason: "index rebuilding" },
            },
          }),
          // 500 (not the realistic-but-retryable 503) so the query settles in
          // one tick: the tiers block's presence — not the status code — is what
          // drives degradation, and every error envelope carries tiers.
          { status: 500, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    renderBrowser();
    await waitFor(() => {
      const banner = document.querySelector("[data-vault-degraded]");
      expect(banner).toBeTruthy();
      expect(banner?.textContent).toMatch(/index rebuilding/);
    });
    // The error banner must NOT have won the early return.
    expect(screen.queryByText(/vault tree unavailable/i)).toBeNull();
  });

  it("still renders the error banner on a tiers-less transport failure", async () => {
    // A non-ok response with no tiers envelope — a genuine transport fault, not
    // a reported tier outage. EngineError.tiers is undefined → not degraded.
    engineClient.useTransport(() =>
      Promise.resolve(new Response("boom", { status: 500 })),
    );
    renderBrowser();
    await waitFor(() => {
      expect(screen.getByText(/vault tree unavailable/i)).toBeTruthy();
    });
    expect(document.querySelector("[data-vault-degraded]")).toBeNull();
  });

  // The single linear nav list: every navigable ROW in DOM order. The binding
  // `LeftRail` 244:750 vault state paints FLAT sections — a quiet SectionLabel
  // eyebrow with no disclosure twisty — so only the rows are navigable; each
  // carries a `.vault/` title and together they are the roving list.
  function navButtons(): HTMLButtonElement[] {
    return screen
      .getAllByRole("button")
      .filter((b) =>
        b.getAttribute("title")?.startsWith(".vault/"),
      ) as HTMLButtonElement[];
  }

  function tabZero(): HTMLButtonElement[] {
    return navButtons().filter((b) => b.tabIndex === 0);
  }

  it("is ONE tab-stop: exactly one navigable element has tabIndex 0 at a time", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" });
    await waitFor(() => expect(navButtons().length).toBeGreaterThan(2));
    // Default: exactly one tabbable element (the first nav element), every
    // other header and row is tabIndex -1 — the rail is a single Tab-stop.
    expect(tabZero()).toHaveLength(1);
    const others = navButtons().filter((b) => b.tabIndex !== 0);
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((b) => b.tabIndex === -1)).toBe(true);
    // The first navigable element is the first row (the flat vault state has no
    // disclosure headers; top-to-bottom focus order starts at the first row).
    expect(tabZero()[0].getAttribute("title")?.startsWith(".vault/")).toBe(true);
  });

  it("moves the roving tabIndex 0 with ArrowDown/ArrowUp across the flat row list", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" });
    await waitFor(() => expect(navButtons().length).toBeGreaterThan(2));

    const first = tabZero()[0];
    expect(first.getAttribute("title")?.startsWith(".vault/")).toBe(true);
    first.focus();
    // ArrowDown moves the "0" to the next row in the single linear list.
    fireEvent.keyDown(first, { key: "ArrowDown" });
    const second = navButtons().find((b) => b.tabIndex === 0)!;
    expect(tabZero()).toHaveLength(1);
    expect(document.activeElement).toBe(second);
    expect(second).not.toBe(first);
    expect(second.getAttribute("title")?.startsWith(".vault/")).toBe(true);
    // ArrowUp returns to the first row.
    fireEvent.keyDown(second, { key: "ArrowUp" });
    expect(tabZero()).toHaveLength(1);
    expect(document.activeElement).toBe(first);
    expect(first.tabIndex).toBe(0);
    // ArrowUp at the top edge clamps rather than wrapping or escaping the rail.
    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(document.activeElement).toBe(first);
  });

  it("paints flat sections (no disclosure headers) whose rows form one list spanning groups", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" });
    await waitFor(() => expect(navButtons().length).toBeGreaterThan(2));
    // The binding vault state has NO collapse affordance — no button carries
    // aria-expanded anywhere in the browser.
    expect(
      screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-expanded")),
    ).toHaveLength(0);
    // Arrowing down from the first row walks the single linear row list, which
    // crosses section boundaries (the flat list is not partitioned by header).
    const first = tabZero()[0];
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    const next = navButtons().find((b) => b.tabIndex === 0)!;
    expect(next).not.toBe(first);
    expect(next.getAttribute("title")?.startsWith(".vault/")).toBe(true);
  });
});
