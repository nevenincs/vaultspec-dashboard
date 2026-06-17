// @vitest-environment happy-dom
//
// Tree mode surface (Figma `LeftRail_tree`): the tree browser's feature →
// doc_type → document nesting, the #feature headers, the plan-status pip on plan
// rows, the in-rail filter-empty state, and the bidirectional doc:<stem>
// selection join — rendered against the REAL engine over the fixture vault (the
// app client is bound to the live transport in liveSetup). No mock.
//
// The loading / degraded / error states are NOT exercised here by stubbing the
// transport into a never-resolving / tier-down / 500 condition (the fakes this
// codebase is burning down); their selection logic is covered by the pure
// deriveVaultTreeAvailability tests in queries.test.ts.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { liveScope } from "../../testing/liveClient";
import { TreeBrowser, type TreeBrowserProps } from "./TreeBrowser";

function renderTree(props: TreeBrowserProps = {}) {
  return render(
    createElement(QueryClientProvider, { client: queryClient }, createElement(TreeBrowser, props)),
  );
}

describe("TreeBrowser nesting + selection + filter (Figma LeftRail_tree, live engine)", () => {
  let scope: string;
  beforeAll(async () => {
    scope = await liveScope();
  });
  beforeEach(() => {
    useViewStore.getState().setScope(scope);
    useViewStore.getState().select(null);
  });
  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
    useViewStore.getState().select(null);
  });

  it("renders the feature → doc_type → document nesting under a labelled landmark", async () => {
    renderTree();
    const nav = await screen.findByRole("navigation", { name: "tree browser" });
    expect(nav).toBeTruthy();
    await waitFor(() => {
      const featureTags = document.querySelectorAll("[data-tree-feature-tag]");
      expect(featureTags.length).toBeGreaterThan(0);
      expect(featureTags[0]!.textContent?.startsWith("#")).toBe(true);
    });
    expect(document.querySelectorAll("[data-tree-doctype]").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { expanded: true }).length).toBeGreaterThan(0);
  });

  it("paints a grayscale-safe plan-status pip on plan rows, lit from real progress", async () => {
    renderTree();
    await screen.findByRole("navigation", { name: "tree browser" });
    await waitFor(() => {
      const pips = document.querySelectorAll("[data-plan-status]");
      expect(pips.length).toBeGreaterThan(0);
      // The pip carries an accessible label naming the plan status (honest, not
      // hue-only), and every pip's state is one of the three designed values.
      expect(pips[0]!.getAttribute("aria-label")).toMatch(/^plan /);
      for (const p of pips) {
        expect(["complete", "in-progress", "not-started"]).toContain(
          p.getAttribute("data-plan-status"),
        );
      }
    });
  });

  it("collapsing a feature header hides its descendant doc-type groups", async () => {
    renderTree();
    await screen.findByRole("navigation", { name: "tree browser" });
    await waitFor(() =>
      expect(document.querySelectorAll("[data-tree-doctype]").length).toBeGreaterThan(0),
    );
    const before = document.querySelectorAll("[data-tree-doctype]").length;
    const firstFeature = screen
      .getAllByRole("button", { expanded: true })
      .find((b) => b.querySelector("[data-tree-feature-tag]"))!;
    fireEvent.click(firstFeature);
    expect(firstFeature.getAttribute("aria-expanded")).toBe("false");
    await waitFor(() =>
      expect(document.querySelectorAll("[data-tree-doctype]").length).toBeLessThan(before),
    );
  });

  it("clicking a document row drives the shared selection (doc:<stem>)", async () => {
    renderTree();
    await screen.findByRole("navigation", { name: "tree browser" });
    const row = await waitFor(() => {
      const candidate = screen
        .getAllByRole("button")
        .find((b) => b.getAttribute("title")?.startsWith(".vault/"));
      expect(candidate).toBeTruthy();
      return candidate!;
    });
    fireEvent.click(row);
    expect(useViewStore.getState().selectedId).toMatch(/^doc:/);
  });

  it("is ONE tab-stop: exactly one navigable node has tabIndex 0 at a time", async () => {
    renderTree();
    await screen.findByRole("navigation", { name: "tree browser" });
    await waitFor(() => {
      const navButtons = screen
        .getAllByRole("button")
        .filter(
          (b) =>
            b.hasAttribute("aria-expanded") || b.getAttribute("title")?.startsWith(".vault/"),
        );
      expect(navButtons.length).toBeGreaterThan(2);
      const tabZero = navButtons.filter((b) => b.tabIndex === 0);
      expect(tabZero).toHaveLength(1);
      expect(tabZero[0]!.hasAttribute("aria-expanded")).toBe(true);
    });
  });

  it("shows the distinct filter-empty state when the in-rail filter matches nothing", async () => {
    renderTree({ filter: "zzz-no-such-document-zzz" });
    await waitFor(() => {
      const empty = document.querySelector("[data-tree-filter-empty]");
      expect(empty?.textContent).toMatch(/no vault documents match the filter/i);
    });
  });
});
