// @vitest-environment happy-dom
//
// Tree mode surface (Figma `LeftRail_tree`, the third browser mode): the tree
// browser's honest states (loading, empty, degraded, error), its feature →
// doc_type → document nesting, the #feature headers, the plan-status pip on plan
// rows, and the bidirectional doc:<stem> selection join — exercised through the
// real stores client transport (mockEngine), no component-internal doubles. The
// tree is a PURE client-side projection of the SAME `/vault-tree` response the
// vault browser reads, so it runs against the identical mock corpus.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { MockEngine, MOCK_SCOPE } from "../../testing/mockEngine";
import { TreeBrowser, type TreeBrowserProps } from "./TreeBrowser";

function renderTree(props: TreeBrowserProps = {}) {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(TreeBrowser, props),
    ),
  );
}

describe("TreeBrowser surface states + nesting + selection (Figma LeftRail_tree)", () => {
  beforeEach(() => {
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

  it("renders a quiet copy-toned loading line while the tree is in flight", () => {
    engineClient.useTransport(() => new Promise<Response>(() => {}));
    renderTree();
    expect(screen.getByRole("status").textContent).toMatch(/reading the vault/i);
  });

  it("renders the feature → doc_type → document nesting under a labelled landmark", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderTree();
    const nav = await screen.findByRole("navigation", { name: "tree browser" });
    expect(nav).toBeTruthy();
    // Level 0: at least one #feature header is rendered as an expanded disclosure.
    await waitFor(() => {
      const featureTags = document.querySelectorAll("[data-tree-feature-tag]");
      expect(featureTags.length).toBeGreaterThan(0);
      // The header text carries the leading '#'.
      expect(featureTags[0]!.textContent?.startsWith("#")).toBe(true);
    });
    // Level 1: doc-type sub-groups exist beneath the features.
    expect(document.querySelectorAll("[data-tree-doctype]").length).toBeGreaterThan(0);
    // Disclosure controls expose their expanded state for assistive tech.
    expect(screen.getAllByRole("button", { expanded: true }).length).toBeGreaterThan(0);
  });

  it("paints a grayscale-safe plan-status pip on plan rows, lit from real progress", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderTree();
    await screen.findByRole("navigation", { name: "tree browser" });
    await waitFor(() => {
      const pips = document.querySelectorAll("[data-plan-status]");
      expect(pips.length).toBeGreaterThan(0);
      // The pip carries an accessible label naming the plan status (honest,
      // not hue-only).
      expect(pips[0]!.getAttribute("aria-label")).toMatch(/^plan /);
      // The pip is lit from the engine-projected checkbox progress (not the
      // not-started fallback), so the corpus's mix exercises ALL THREE design
      // states (✓ complete / ◐ in-progress / ○ not-started) — matching the
      // binding Figma plan rows.
      const states = new Set([...pips].map((p) => p.getAttribute("data-plan-status")));
      expect(states).toEqual(new Set(["complete", "in-progress", "not-started"]));
    });
  });

  it("collapsing a feature header hides its descendant doc-type groups", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderTree();
    await screen.findByRole("navigation", { name: "tree browser" });
    await waitFor(() =>
      expect(document.querySelectorAll("[data-tree-doctype]").length).toBeGreaterThan(
        0,
      ),
    );
    const before = document.querySelectorAll("[data-tree-doctype]").length;
    // Collapse the first feature header (the first expanded disclosure button).
    const firstFeature = screen
      .getAllByRole("button", { expanded: true })
      .find((b) => b.querySelector("[data-tree-feature-tag]"))!;
    fireEvent.click(firstFeature);
    expect(firstFeature.getAttribute("aria-expanded")).toBe("false");
    // Fewer doc-type groups are now in the DOM (the collapsed feature's are gone).
    await waitFor(() =>
      expect(document.querySelectorAll("[data-tree-doctype]").length).toBeLessThan(
        before,
      ),
    );
  });

  it("clicking a document row drives the shared selection (doc:<stem>)", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderTree();
    await screen.findByRole("navigation", { name: "tree browser" });
    // Find a document row (a button with a .vault/ title, not a disclosure).
    const row = await waitFor(() => {
      const candidate = screen
        .getAllByRole("button")
        .find((b) => b.getAttribute("title")?.startsWith(".vault/"));
      expect(candidate).toBeTruthy();
      return candidate!;
    });
    fireEvent.click(row);
    // The view store now holds a doc: selection derived from the row's stem.
    expect(useViewStore.getState().selectedId).toMatch(/^doc:/);
  });

  it("is ONE tab-stop: exactly one navigable node has tabIndex 0 at a time", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderTree();
    await screen.findByRole("navigation", { name: "tree browser" });
    await waitFor(() => {
      const navButtons = screen
        .getAllByRole("button")
        .filter(
          (b) =>
            b.hasAttribute("aria-expanded") ||
            b.getAttribute("title")?.startsWith(".vault/"),
        );
      expect(navButtons.length).toBeGreaterThan(2);
      const tabZero = navButtons.filter((b) => b.tabIndex === 0);
      expect(tabZero).toHaveLength(1);
      // The first navigable element is a feature disclosure header.
      expect(tabZero[0]!.hasAttribute("aria-expanded")).toBe(true);
    });
  });

  it("shows the distinct filter-empty state when the in-rail filter matches nothing", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderTree({ filter: "zzz-no-such-document-zzz" });
    await waitFor(() => {
      const empty = document.querySelector("[data-tree-filter-empty]");
      expect(empty?.textContent).toMatch(/no vault documents match the filter/i);
    });
  });

  it("renders a designed degraded banner (with reason), still listing what loaded", async () => {
    const mock = new MockEngine();
    mock.degrade("semantic", "rag service down");
    engineClient.useTransport(mock.fetchImpl);
    renderTree();
    await waitFor(() => {
      const banner = document.querySelector("[data-tree-degraded]");
      expect(banner?.textContent).toMatch(/rag service down/);
    });
    expect(screen.queryByText(/vault tree unavailable/i)).toBeNull();
    expect(screen.getByRole("navigation", { name: "tree browser" })).toBeTruthy();
  });

  it("renders a contained error with retry on a tiers-less transport failure", async () => {
    engineClient.useTransport(() =>
      Promise.resolve(new Response("boom", { status: 500 })),
    );
    renderTree();
    await waitFor(() => {
      expect(screen.getByText(/vault tree unavailable/i)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });
});
