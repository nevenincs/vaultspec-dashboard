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
    // Disclosure controls expose their expanded state for assistive tech.
    await waitFor(() => {
      const groups = screen.getAllByRole("button", { expanded: true });
      expect(groups.length).toBeGreaterThan(0);
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

  it("moves row focus with ArrowDown/ArrowUp (roving-tabindex keyboard contract)", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" });
    // Rows are the activatable controls carrying the full path as title; the
    // disclosure controls (aria-expanded) are excluded by filtering on title.
    await waitFor(() => {
      const rows = screen
        .getAllByRole("button")
        .filter((b) => b.getAttribute("title")?.startsWith(".vault/"));
      expect(rows.length).toBeGreaterThan(1);
    });
    const rows = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("title")?.startsWith(".vault/"));
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
});
