// @vitest-environment happy-dom
//
// The Status overview surface (status-overview ADR): the rail's primary tab
// exercised through the REAL stores client transport (mockEngine), with NO
// component-internal doubles. The mock serves `/status`, `/map`, `/pipeline`,
// `/nodes/{id}/plan-interior`, and `/history` byte-for-byte in the live wire
// shape, so these consumer tests prove mock-to-live fidelity through the same
// client path the app uses (mock-mirrors-live-wire-shape).
//
// The three sections are asserted: the location anchor ("Where are we?"), the
// plan-derived open-work list with its step-tree expansion ("What is being worked
// on?"), and the recent-commit list ("What has been committed?"). Open-in-viewer
// fires on a plan row (the review-rail-viewers intent). Degradation is driven by a
// real `tiers` block read through the stores selector, never guessed from a
// transport error. Theme parity is checked across light / dark / high-contrast:
// every text/surface color is a `--color-*` token, so a theme swap re-renders the
// SAME structural DOM (no raw hex, no per-theme component branch).

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { MockEngine, MOCK_SCOPE } from "../../testing/mockEngine";
import { StatusTab } from "./StatusTab";

function renderStatus() {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(StatusTab),
    ),
  );
}

function useMock(configure?: (m: MockEngine) => void): MockEngine {
  const mock = new MockEngine();
  configure?.(mock);
  engineClient.useTransport(mock.fetchImpl);
  return mock;
}

describe("StatusTab — the status overview (status-overview ADR, honest-against-live)", () => {
  beforeEach(() => {
    // Pin the active scope so the composed queries run against the mock without
    // the map/session round-trip resolving the default.
    useViewStore.getState().setScope(MOCK_SCOPE);
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
    useViewStore.getState().select(null);
    useViewStore.getState().closeViewer();
    useViewStore.getState().setTimelineMode({ kind: "live" });
    document.documentElement.removeAttribute("data-theme");
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  // --- Location anchor ("Where are we?") -----------------------------------------

  it("renders the location anchor: absolute path, branch, and the main marker", async () => {
    useMock();
    renderStatus();

    const anchor = await waitFor(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-location-anchor][data-location-state="located"]',
      );
      expect(el).toBeTruthy();
      return el!;
    });
    // The path is the scope token, shown monospace (identity).
    expect(anchor.querySelector("[data-location-path]")?.textContent).toBe(MOCK_SCOPE);
    // The branch reads from the resolved worktree / git rollup.
    await waitFor(() => {
      expect(anchor.querySelector("[data-location-branch]")?.textContent).toBe("main");
    });
    // The active scope is the repository's main worktree → the main marker shows.
    await waitFor(() => {
      expect(anchor.querySelector("[data-location-main]")).toBeTruthy();
    });
  });

  it("shows the empty anchor when no scope is selected", async () => {
    useViewStore.getState().setScope(null);
    useMock();
    renderStatus();
    await waitFor(() => {
      expect(
        document.querySelector('[data-location-anchor][data-location-state="empty"]'),
      ).toBeTruthy();
    });
  });

  // --- Open plans ("What is being worked on?") -----------------------------------

  it("renders the plan-derived open-work list with progress and tier (board 238:601)", async () => {
    useMock();
    renderStatus();

    const list = await waitFor(() => {
      const el = document.querySelector<HTMLElement>("[data-open-plans-list]");
      expect(el).toBeTruthy();
      return el!;
    });
    // The board paints the plan row as a flat list item (twisty · dot · title ·
    // count · tier); the row body opens the plan in the reader.
    const item = list.querySelector<HTMLElement>("[data-open-plan]");
    expect(item).toBeTruthy();
    // The completion count is shown as tabular-numeral TEXT (board "18/24").
    expect(item!.querySelector("[data-plan-progress]")?.textContent).toMatch(
      /^\d+\/\d+$/,
    );
    // The tier reads the real plan-tier facet (L1–L4), shown as the board's
    // bare tier text (board "L3").
    expect(item!.querySelector("[data-plan-tier]")?.textContent).toMatch(/^L[1-4]$/);
  });

  it("expands an open-plan row into its lazily-loaded open steps (reused step tree)", async () => {
    useMock();
    renderStatus();

    const toggle = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>("[data-open-plan-toggle]");
      expect(el).toBeTruthy();
      return el!;
    });
    // The step tree is NOT in the DOM before expand (lazy load).
    expect(document.querySelector("[data-step-tree]")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    const tree = await waitFor(() => {
      const el = document.querySelector<HTMLElement>("[data-step-tree]");
      expect(el).toBeTruthy();
      return el!;
    });
    // The open steps render with grayscale-safe check marks (filled/hollow by shape).
    expect(tree.querySelectorAll("[data-step-check]").length).toBeGreaterThan(0);
  });

  it("fires open-in-viewer on a plan row, opening the plan in the markdown reader", async () => {
    useMock();
    renderStatus();

    const row = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>("[data-open-plan-row]");
      expect(el).toBeTruthy();
      return el!;
    });
    const nodeId = row.closest("[data-open-plan]")!.getAttribute("data-node-id")!;
    expect(useViewStore.getState().viewerTarget).toBeNull();

    fireEvent.click(row);

    // The plan opens in the markdown reader AND becomes the selection — two
    // distinct intents (review-rail-viewers ADR).
    expect(useViewStore.getState().viewerTarget).toEqual({
      nodeId,
      surface: "markdown",
    });
    expect(useViewStore.getState().selectedId).toBe(nodeId);
  });

  it("renders the designed degraded open-plans state from the tiers truth, not a transport error", async () => {
    useMock((m) => m.degrade("structural", "vault index rebuilding"));
    renderStatus();

    await waitFor(() => {
      const el = document.querySelector('[data-open-plans-state="degraded"]');
      expect(el).toBeTruthy();
      expect(el?.textContent).toMatch(/pipeline status unavailable/i);
    });
    expect(document.querySelector("[data-open-plans-list]")).toBeNull();
  });

  // --- Recent commits ("What has been committed?") -------------------------------

  it("renders the recent-commit list with subjects and short hashes, newest-first", async () => {
    useMock();
    renderStatus();

    const list = await waitFor(() => {
      const el = document.querySelector<HTMLElement>("[data-recent-commits-list]");
      expect(el).toBeTruthy();
      return el!;
    });
    const commits = Array.from(
      list.querySelectorAll<HTMLElement>("[data-recent-commit]"),
    );
    expect(commits.length).toBeGreaterThan(0);
    for (const c of commits) {
      // The subject is the primary carrier (non-empty text).
      const label = c.querySelector("button")?.getAttribute("aria-label") ?? "";
      expect(label).toMatch(/^commit [0-9a-f]+: /);
      // The short hash is shown monospace (identity).
      expect(c.querySelector("[data-short-hash]")?.textContent).toMatch(/^[0-9a-f]+$/);
    }
  });

  it("selects the touched nodes when a commit row is activated (graph cross-link)", async () => {
    useMock();
    renderStatus();

    const commitBtn = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>(
        "[data-recent-commit] button:not([disabled])",
      );
      expect(el).toBeTruthy();
      return el!;
    });
    fireEvent.click(commitBtn);
    const sel = useViewStore.getState().selection;
    expect(sel?.kind).toBe("event");
    if (sel?.kind === "event") {
      // No commit:* id leaks into the selected node set — only touched docs/code.
      expect(sel.nodeIds.every((id) => !id.startsWith("commit:"))).toBe(true);
      expect(sel.nodeIds.length).toBeGreaterThan(0);
    }
  });

  // --- Theme parity (light / dark / high-contrast) -------------------------------

  it.each(["light", "dark", "hc"] as const)(
    "renders the three sections identically across the %s theme (token-driven, no raw hex)",
    async (theme) => {
      document.documentElement.setAttribute("data-theme", theme);
      useMock();
      renderStatus();

      // Every section is present and structurally identical regardless of theme —
      // warmth/contrast live in the `--color-*` tokens, not in per-theme markup.
      await waitFor(() => {
        expect(document.querySelector("[data-status-tab]")).toBeTruthy();
        expect(
          document.querySelector(
            '[data-location-anchor][data-location-state="located"]',
          ),
        ).toBeTruthy();
        expect(document.querySelector("[data-open-plans]")).toBeTruthy();
        expect(document.querySelector("[data-recent-commits]")).toBeTruthy();
      });

      // No element carries a raw hex color in an inline style (theming is via
      // token classes only — themes-are-oklch-generated-from-a-token-tier).
      const inlineStyled = Array.from(
        document.querySelectorAll<HTMLElement>("[data-status-tab] *"),
      );
      for (const el of inlineStyled) {
        const style = el.getAttribute("style") ?? "";
        expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      }
    },
  );
});
