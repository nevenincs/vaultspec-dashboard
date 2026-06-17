// @vitest-environment happy-dom
//
// Sidebar surface adoption (W02.P05.S21): the vault browser rendered against the
// REAL engine over the fixture vault — no mock transport, no injected backend
// conditions. These cover the loaded state and the keyboard / a11y contract
// (the single roving Tab-stop, ArrowDown/Up across the flat row list).
//
// The four-honest-states selection logic (loading / empty / degraded / error)
// lives in the PURE `deriveVaultTreeAvailability` selector, tested over explicit
// tiers/error vectors in queries.test.ts. It is NOT re-tested here by stubbing
// the transport into a never-resolving / 500 / tier-down state — those are the
// fakes this codebase is burning down. A healthy live surface renders the loaded
// state; the degraded/error JSX is driven by the pure selector's verdict.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { liveScope } from "../../testing/liveClient";
import { VaultBrowser } from "./VaultBrowser";

function renderBrowser() {
  return render(
    createElement(QueryClientProvider, { client: queryClient }, createElement(VaultBrowser)),
  );
}

describe("VaultBrowser loaded state + a11y (S21, live engine)", () => {
  let scope: string;
  beforeAll(async () => {
    scope = await liveScope();
  });
  beforeEach(() => {
    // Pin the active scope synchronously so useActiveScope resolves without the
    // map/session round-trip; the vault-tree query then runs against the engine.
    useViewStore.getState().setScope(scope);
  });
  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
  });

  it("lists grouped rows under a labelled navigation landmark when the tree loads", async () => {
    renderBrowser();
    const nav = await screen.findByRole("navigation", { name: "vault browser" });
    expect(nav).toBeTruthy();
    // Flat sections (binding LeftRail 244:750): each group is a quiet SectionLabel
    // eyebrow over its rows; the landmark lists navigable rows, each carrying its
    // `.vault/` path as title.
    await waitFor(() => {
      const rows = screen
        .getAllByRole("button")
        .filter((b) => b.getAttribute("title")?.startsWith(".vault/"));
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  function navButtons(): HTMLButtonElement[] {
    return screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("title")?.startsWith(".vault/")) as HTMLButtonElement[];
  }

  function tabZero(): HTMLButtonElement[] {
    return navButtons().filter((b) => b.tabIndex === 0);
  }

  it("is ONE tab-stop: exactly one navigable element has tabIndex 0 at a time", async () => {
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" });
    await waitFor(() => expect(navButtons().length).toBeGreaterThan(2));
    expect(tabZero()).toHaveLength(1);
    const others = navButtons().filter((b) => b.tabIndex !== 0);
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((b) => b.tabIndex === -1)).toBe(true);
    expect(tabZero()[0].getAttribute("title")?.startsWith(".vault/")).toBe(true);
  });

  it("moves the roving tabIndex 0 with ArrowDown/ArrowUp across the flat row list", async () => {
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" });
    await waitFor(() => expect(navButtons().length).toBeGreaterThan(2));

    const first = tabZero()[0];
    expect(first.getAttribute("title")?.startsWith(".vault/")).toBe(true);
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    const second = navButtons().find((b) => b.tabIndex === 0)!;
    expect(tabZero()).toHaveLength(1);
    expect(document.activeElement).toBe(second);
    expect(second).not.toBe(first);
    expect(second.getAttribute("title")?.startsWith(".vault/")).toBe(true);
    fireEvent.keyDown(second, { key: "ArrowUp" });
    expect(tabZero()).toHaveLength(1);
    expect(document.activeElement).toBe(first);
    expect(first.tabIndex).toBe(0);
    // ArrowUp at the top edge clamps rather than wrapping or escaping the rail.
    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(document.activeElement).toBe(first);
  });

  it("paints flat sections (no disclosure headers) whose rows form one list spanning groups", async () => {
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" });
    await waitFor(() => expect(navButtons().length).toBeGreaterThan(2));
    // The binding vault state has NO collapse affordance — no button carries
    // aria-expanded anywhere in the browser.
    expect(
      screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-expanded")),
    ).toHaveLength(0);
    const first = tabZero()[0];
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    const next = navButtons().find((b) => b.tabIndex === 0)!;
    expect(next).not.toBe(first);
    expect(next.getAttribute("title")?.startsWith(".vault/")).toBe(true);
  });
});
