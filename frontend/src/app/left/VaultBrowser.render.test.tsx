// @vitest-environment happy-dom
//
// Vault tab surface adoption (binding `LeftRail` 238:600): the vault browser
// rendered against the REAL engine over the fixture vault — no mock transport, no
// injected backend conditions. The Vault tab is TWO collapsible sections (Features
// + Documents) that start EXPANDED by default to match the binding (Figma 238:600
// SectionHeader is open); collapsing a section hides its folder rows, and expanding
// a folder reveals its document rows. These cover the expanded default, the
// one-tab-stop roving a11y contract, the disclosure cascade, and selection.
//
// The four-honest-states selection logic (loading / empty / degraded / error) lives
// in the PURE `deriveVaultTreeAvailability` selector, tested over explicit
// tiers/error vectors in queries.test.ts. It is NOT re-tested here by stubbing the
// transport into a never-resolving / 500 / tier-down state — those are the fakes
// this codebase is burning down.

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
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(VaultBrowser),
    ),
  );
}

describe("VaultBrowser Features + Documents sections + a11y (live engine)", () => {
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

  // Every navigable element in the rail's single roving-tabindex order: the two
  // section headers, the folder rows, and the document rows. Section/folder headers
  // carry aria-expanded; document rows carry a `.vault/` title.
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

  it("renders both sections expanded by default under a labelled landmark", async () => {
    renderBrowser();
    const nav = await screen.findByRole("navigation", { name: "vault browser" });
    expect(nav).toBeTruthy();
    await waitFor(() => {
      const sections = document.querySelectorAll("[data-vault-section]");
      expect(sections.length).toBe(2);
    });
    // Sections default OPEN (binding 238:600) → their folder rows ARE mounted, and
    // both section headers read expanded.
    await waitFor(() => {
      expect(document.querySelectorAll("[data-vault-folder]").length).toBeGreaterThan(
        0,
      );
    });
    expect(
      screen.getAllByRole("button", { expanded: true }).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("is ONE tab-stop: exactly one navigable element has tabIndex 0 at a time", async () => {
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" });
    await waitFor(() => expect(navButtons().length).toBeGreaterThan(0));
    expect(tabZero()).toHaveLength(1);
    const others = navButtons().filter((b) => b.tabIndex !== 0);
    expect(others.every((b) => b.tabIndex === -1)).toBe(true);
    expect(tabZero()[0].hasAttribute("aria-expanded")).toBe(true);
  });

  it("collapses then re-expands a section, and expands a folder to reveal document rows", async () => {
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" });
    // Sections default open → a section header reads expanded:true.
    const section = await waitFor(() => {
      const button = screen
        .getAllByRole("button", { expanded: true })
        .find((b) => b.querySelector("[data-vault-section]"));
      expect(button).toBeTruthy();
      return button!;
    });
    // Collapse it, then re-expand — the disclosure toggle round-trips.
    fireEvent.click(section);
    expect(section.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(section);
    expect(section.getAttribute("aria-expanded")).toBe("true");

    const folder = await waitFor(() => {
      const button = screen
        .getAllByRole("button", { expanded: false })
        .find((b) => b.closest("[data-vault-folder]"));
      expect(button).toBeTruthy();
      return button!;
    });
    fireEvent.click(folder);
    await waitFor(() => {
      const rows = screen
        .getAllByRole("button")
        .filter((b) => b.getAttribute("title")?.startsWith(".vault/"));
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  it("moves the roving tabIndex 0 with ArrowDown/ArrowUp across visible nodes", async () => {
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" });
    await waitFor(() => expect(navButtons().length).toBeGreaterThan(1));
    const first = tabZero()[0];
    expect(first.hasAttribute("aria-expanded")).toBe(true);
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    const second = navButtons().find((b) => b.tabIndex === 0)!;
    expect(tabZero()).toHaveLength(1);
    expect(document.activeElement).toBe(second);
    expect(second).not.toBe(first);
    fireEvent.keyDown(second, { key: "ArrowUp" });
    expect(tabZero()).toHaveLength(1);
    expect(document.activeElement).toBe(first);
    expect(first.tabIndex).toBe(0);
    // ArrowUp at the top edge clamps rather than wrapping or escaping the rail.
    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(document.activeElement).toBe(first);
  });

  it("clicking a document row drives the shared selection (doc:<stem>)", async () => {
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" });
    // Sections default open → folder rows are already visible; expand one directly.
    const folder = await waitFor(() => {
      const button = screen
        .getAllByRole("button", { expanded: false })
        .find((b) => b.closest("[data-vault-folder]"));
      expect(button).toBeTruthy();
      return button!;
    });
    fireEvent.click(folder);
    const row = await waitFor(() => {
      const candidate = screen
        .getAllByRole("button")
        .find((b) => b.getAttribute("title")?.startsWith(".vault/"));
      expect(candidate).toBeTruthy();
      return candidate!;
    });
    fireEvent.click(row);
    await waitFor(() => {
      expect(row.getAttribute("aria-current")).toBe("page");
    });
  });
});
