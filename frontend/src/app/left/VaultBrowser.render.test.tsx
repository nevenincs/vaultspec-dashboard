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

  // The single linear nav list: every navigable button (group disclosure
  // headers AND tree rows) in DOM order. Headers carry aria-expanded; rows
  // carry a `.vault/` title — the two together are the roving list.
  function navButtons(): HTMLButtonElement[] {
    return screen
      .getAllByRole("button")
      .filter(
        (b) =>
          b.hasAttribute("aria-expanded") ||
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
    // The first navigable element is a group disclosure header (top-to-bottom
    // focus order starts at the first header, not the first row).
    expect(tabZero()[0].hasAttribute("aria-expanded")).toBe(true);
  });

  it("moves the roving tabIndex 0 with ArrowDown/ArrowUp, stepping header → row", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" });
    await waitFor(() => expect(navButtons().length).toBeGreaterThan(2));

    const header = tabZero()[0];
    expect(header.hasAttribute("aria-expanded")).toBe(true);
    header.focus();
    // ArrowDown from the first header lands on its first row; the "0" follows.
    fireEvent.keyDown(header, { key: "ArrowDown" });
    const second = navButtons().find((b) => b.tabIndex === 0)!;
    expect(tabZero()).toHaveLength(1);
    expect(document.activeElement).toBe(second);
    expect(second.getAttribute("title")?.startsWith(".vault/")).toBe(true);
    // ArrowUp returns to the header — disclosure headers ARE arrow-reachable
    // (so a collapsed group can be reopened from the keyboard).
    fireEvent.keyDown(second, { key: "ArrowUp" });
    expect(tabZero()).toHaveLength(1);
    expect(document.activeElement).toBe(header);
    expect(header.tabIndex).toBe(0);
    // ArrowUp at the top edge clamps rather than wrapping or escaping the rail.
    fireEvent.keyDown(header, { key: "ArrowUp" });
    expect(document.activeElement).toBe(header);
  });

  it("keeps a collapsed group's header arrow-reachable to reopen it", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" });
    await waitFor(() => expect(navButtons().length).toBeGreaterThan(2));

    const headers = navButtons().filter((b) => b.hasAttribute("aria-expanded"));
    expect(headers.length).toBeGreaterThan(0);
    const first = headers[0];
    // Collapse the first group.
    fireEvent.click(first);
    expect(first.getAttribute("aria-expanded")).toBe("false");
    // The header is still in the roving list and still reachable: arrowing from
    // it down reaches the NEXT header (its rows are gone), and arrowing back up
    // returns to it — it never falls out of the keyboard path.
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    const next = navButtons().find((b) => b.tabIndex === 0)!;
    expect(next).not.toBe(first);
    expect(next.hasAttribute("aria-expanded")).toBe(true);
    fireEvent.keyDown(next, { key: "ArrowUp" });
    expect(document.activeElement).toBe(first);
    expect(first.tabIndex).toBe(0);
  });
});
