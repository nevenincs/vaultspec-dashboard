// @vitest-environment happy-dom
//
// Vault tab surface adoption (binding `LeftRail` 238:600): the vault browser
// rendered against the REAL engine over the fixture vault — no mock transport, no
// injected backend conditions. The Vault tab is TWO collapsible sections (Features
// + Documents) that start COLLAPSED by default (parity with the activity rail's
// persisted folds — a user-directed divergence from the binding's open sections),
// and whose open/closed choice persists across reloads. Expanding a section reveals
// its folder rows, and expanding a folder reveals its document rows. These cover the
// collapsed default, the one-tab-stop roving a11y contract, the disclosure cascade,
// and selection.
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

import { dashboardDocumentStateResetPatch } from "../../stores/server/dashboardState";
import { queryClient } from "../../stores/server/queryClient";
import { useBrowserTreeExpansionStore } from "../../stores/view/browserTreeExpansion";
import { setFollowMode } from "../../stores/view/selection";
import { useViewStore } from "../../stores/view/viewStore";
import { createLiveClient, liveScope } from "../../testing/liveClient";
import { VaultBrowser } from "./VaultBrowser";
import { ENGINE_WAIT } from "../../testing/timing";

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
  beforeEach(async () => {
    // Reset the SERVER dashboard-state to default (TIH-007a): an earlier suite persists
    // `selected_ids` on the shared engine, and this suite's client-only cache reset
    // can't clear it. If it leaked in, the follow-mode reveal-on-selection reaction
    // would fire when that stale selection arrives and re-render the tree — detaching a
    // test's captured collapsed folder so no leaf ever mounts (the GS-007 failure).
    await createLiveClient().patchDashboardState(
      dashboardDocumentStateResetPatch(scope),
    );
    // Follow mode OFF here (TIH-007b): this suite tests disclosure mechanics; the
    // reveal-on-selection reaction has its own dedicated suite, so it must not fire here.
    setFollowMode(false);
    // Start every test from a clean, fully-collapsed disclosure state so the
    // persisted (localStorage-backed) tree store cannot leak expansion between tests
    // — the collapsed default is the contract under test.
    localStorage.clear();
    useBrowserTreeExpansionStore.getState().reset();
    // Pin the active scope synchronously so useActiveScope resolves without the
    // map/session round-trip; the vault-tree query then runs against the engine.
    useViewStore.getState().setScope(scope);
  });
  afterEach(async () => {
    cleanup();
    // DRAIN before clearing: the rail mounts a BACKGROUND dashboard-state query the
    // tests never await (they only wait for the vault-tree to render). If a
    // dashboard-state fetch is still in flight at file teardown, the shared liveSetup
    // `happyDOM.abort()` drain aborts it AFTER its query/observer is gone, orphaning the
    // benign AbortError into an UNHANDLED rejection that fails the run. Waiting for
    // isFetching()===0 lets the (local, fast) live engine settle every fetch first, so
    // nothing is left for the teardown abort to orphan — no masking, no swallowed errors.
    await waitFor(() => expect(queryClient.isFetching()).toBe(0), ENGINE_WAIT);
    queryClient.clear();
    useViewStore.getState().setScope(null);
    setFollowMode(true); // restore the view-local default so follow-mode-off can't leak
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

  // Sections default COLLAPSED; open the named section and wait for its body so its
  // folder rows mount before a test inspects them.
  async function expandSection(name: "features" | "documents"): Promise<HTMLElement> {
    const header = await waitFor(() => {
      const button = screen.getAllByRole("button").find((b) => {
        const label = b.querySelector("[data-vault-section]");
        return label?.getAttribute("data-vault-section") === name;
      });
      expect(button).toBeTruthy();
      return button!;
    }, ENGINE_WAIT);
    if (header.getAttribute("aria-expanded") === "false") {
      fireEvent.click(header);
    }
    await waitFor(
      () => expect(header.getAttribute("aria-expanded")).toBe("true"),
      ENGINE_WAIT,
    );
    return header;
  }

  it("renders both sections collapsed by default under a labelled landmark", async () => {
    renderBrowser();
    const nav = await screen.findByRole(
      "navigation",
      { name: "vault browser" },
      ENGINE_WAIT,
    );
    expect(nav).toBeTruthy();
    await waitFor(() => {
      const sections = document.querySelectorAll("[data-vault-section]");
      expect(sections.length).toBe(2);
    }, ENGINE_WAIT);
    // Sections default COLLAPSED → both section headers read NOT expanded and no
    // folder rows are mounted yet.
    const sectionHeaders = screen
      .getAllByRole("button")
      .filter((b) => b.querySelector("[data-vault-section]"));
    expect(sectionHeaders).toHaveLength(2);
    expect(
      sectionHeaders.every((b) => b.getAttribute("aria-expanded") === "false"),
    ).toBe(true);
    expect(document.querySelectorAll("[data-vault-folder]").length).toBe(0);
    // Expanding a section mounts its folder rows.
    await expandSection("documents");
    await waitFor(() => {
      expect(document.querySelectorAll("[data-vault-folder]").length).toBeGreaterThan(
        0,
      );
    }, ENGINE_WAIT);
  });

  it("is ONE tab-stop: exactly one navigable element has tabIndex 0 at a time", async () => {
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" }, ENGINE_WAIT);
    await waitFor(() => expect(navButtons().length).toBeGreaterThan(0), ENGINE_WAIT);
    expect(tabZero()).toHaveLength(1);
    const others = navButtons().filter((b) => b.tabIndex !== 0);
    expect(others.every((b) => b.tabIndex === -1)).toBe(true);
    expect(tabZero()[0].hasAttribute("aria-expanded")).toBe(true);
  });

  it("collapses then re-expands a section, and expands a folder to reveal document rows", async () => {
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" }, ENGINE_WAIT);
    // Open the Documents section (collapsed by default), then round-trip its
    // disclosure: collapse → re-expand.
    const section = await expandSection("documents");
    fireEvent.click(section);
    expect(section.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(section);
    expect(section.getAttribute("aria-expanded")).toBe("true");

    // A Documents-section category folder expands DIRECTLY to document rows (the
    // Features-section feature folders expand to category sub-folders first, ADR D4).
    const folder = await waitFor(() => {
      const documentsHeader = screen.getAllByRole("button").find((b) => {
        const label = b.querySelector("[data-vault-section]");
        return label?.getAttribute("data-vault-section") === "documents";
      })!;
      const body = document.getElementById(
        documentsHeader.getAttribute("aria-controls")!,
      );
      const button = body?.querySelector<HTMLButtonElement>(
        "[data-vault-folder] > button[aria-expanded='false']",
      );
      expect(button).toBeTruthy();
      return button!;
    }, ENGINE_WAIT);
    fireEvent.click(folder);
    await waitFor(() => {
      const rows = screen
        .getAllByRole("button")
        .filter((b) => b.getAttribute("title")?.startsWith(".vault/"));
      expect(rows.length).toBeGreaterThan(0);
    }, ENGINE_WAIT);
  });

  it("moves the roving tabIndex 0 with ArrowDown/ArrowUp across visible nodes", async () => {
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" }, ENGINE_WAIT);
    await waitFor(() => expect(navButtons().length).toBeGreaterThan(1), ENGINE_WAIT);
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

  it("expands a feature into category sub-folders (not a flat doc list), each leading with a category dot", async () => {
    // ADR D4: a feature folder expands to category sub-folders (Research /
    // Decisions / …), NOT directly to documents; ADR D3: every folder row leads
    // with a centralized category icon, never a folder glyph or a dot.
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" }, ENGINE_WAIT);
    // Open the Features section (collapsed by default) so its feature folder rows mount.
    await expandSection("features");
    const featureFolder = await waitFor(() => {
      const button = screen
        .getAllByRole("button", { expanded: false })
        .find((b) => b.parentElement?.hasAttribute("data-vault-folder"));
      expect(button).toBeTruthy();
      return button!;
    }, ENGINE_WAIT);
    // The feature row carries a category icon (the centralized DocTypeMark), not a folder glyph.
    expect(featureFolder.querySelector("[data-doc-mark]")).toBeTruthy();
    fireEvent.click(featureFolder);
    // Expanding it reveals category SUB-FOLDER rows (aria-expanded buttons), each
    // itself carrying a category dot — NOT a flat list of `.vault/` document rows.
    const subFolder = await waitFor(() => {
      const controlled = featureFolder.getAttribute("aria-controls")!;
      const body = document.getElementById(controlled)!;
      const folderButton = body.querySelector<HTMLButtonElement>(
        "button[aria-expanded]",
      );
      expect(folderButton).toBeTruthy();
      return folderButton!;
    }, ENGINE_WAIT);
    expect(subFolder.querySelector("[data-doc-mark]")).toBeTruthy();
    // A category sub-folder carries a category token on its icon (e.g. adr/research).
    expect(
      subFolder.querySelector("[data-category]")?.getAttribute("data-category"),
    ).toBeTruthy();
  });

  it("groups the Documents section by category and never surfaces an index row", async () => {
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" }, ENGINE_WAIT);
    // Open the Documents section (collapsed by default) to mount its category folders.
    const documentsHeader = await expandSection("documents");
    // Its body's folder rows are category folders (each with a category icon), and an
    // `index` group is never one of them (ADR D5).
    const body = document.getElementById(
      documentsHeader.getAttribute("aria-controls")!,
    );
    await waitFor(() => {
      const folders = body!.querySelectorAll<HTMLButtonElement>(
        "button[aria-expanded]",
      );
      expect(folders.length).toBeGreaterThan(0);
      for (const folder of folders) {
        expect(folder.querySelector("[data-doc-mark]")).toBeTruthy();
        expect(folder.textContent?.toLowerCase()).not.toContain("index");
      }
    }, ENGINE_WAIT);
  });

  it("clicking a document row drives the shared selection (doc:<stem>)", async () => {
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" }, ENGINE_WAIT);
    // Open the Documents section (collapsed by default), then expand a category
    // folder, which reveals its documents directly.
    const documentsHeader = await expandSection("documents");
    const folder = await waitFor(() => {
      const body = document.getElementById(
        documentsHeader.getAttribute("aria-controls")!,
      );
      const button = body?.querySelector<HTMLButtonElement>(
        "[data-vault-folder] > button[aria-expanded='false']",
      );
      expect(button).toBeTruthy();
      return button!;
    }, ENGINE_WAIT);
    fireEvent.click(folder);
    // The clicked Documents-section category folder reveals its document rows
    // directly; click one to drive the shared selection.
    const row = await waitFor(() => {
      const candidate = screen
        .getAllByRole("button")
        .find((b) => b.getAttribute("title")?.startsWith(".vault/"));
      expect(candidate).toBeTruthy();
      return candidate!;
    }, ENGINE_WAIT);
    fireEvent.click(row);
    await waitFor(() => {
      expect(row.getAttribute("aria-current")).toBe("page");
    }, ENGINE_WAIT);
  });

  it("renders folders and leaves through one fully-rounded row shell with one standardized selection", async () => {
    // Every tree level uses the SAME row shell: fully rounded (`rounded-fg-xs`),
    // never a square or half-rounded edge. Selection is the rounded accent-tint FILL
    // (`bg-accent-subtle`) over the whole row + accent label ink — NEVER a left-edge
    // bar (`border-l*`) or a half-rounded (`rounded-r*`) leaf, which is exactly the
    // divergence this guards against.
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" }, ENGINE_WAIT);
    // Open the Documents section (collapsed by default) to reach a category folder.
    const documentsHeader = await expandSection("documents");
    const folder = await waitFor(() => {
      const body = document.getElementById(
        documentsHeader.getAttribute("aria-controls")!,
      );
      const button = body?.querySelector<HTMLButtonElement>(
        "[data-vault-folder] > button[aria-expanded='false']",
      );
      expect(button).toBeTruthy();
      return button!;
    }, ENGINE_WAIT);
    // The folder row is fully rounded.
    expect(folder.className).toContain("rounded-fg-xs");
    fireEvent.click(folder);
    const leaf = await waitFor(() => {
      const candidate = screen
        .getAllByRole("button")
        .find((b) => b.getAttribute("title")?.startsWith(".vault/"));
      expect(candidate).toBeTruthy();
      return candidate!;
    }, ENGINE_WAIT);
    // The leaf uses the SAME fully-rounded shell as the folder — no divergence.
    expect(leaf.className).toContain("rounded-fg-xs");
    expect(leaf.className).not.toContain("border-l");
    expect(leaf.className).not.toContain("rounded-r");
    // Selecting the leaf applies the standardized rounded fill, not a left bar.
    fireEvent.click(leaf);
    await waitFor(() => {
      expect(leaf.getAttribute("aria-current")).toBe("page");
    }, ENGINE_WAIT);
    expect(leaf.className).toContain("bg-accent-subtle");
    expect(leaf.className).not.toContain("border-l");
  });
});
