// @vitest-environment happy-dom
//
// Git diff browser surface adoption (W02.P13.S29, revised after review): the
// ChangesOverview's HONEST state machine against the CURRENT live engine —
// clean working tree, the dirty working-tree state rendered as an engine-blocked
// panel (the live wire serves a dirty BOOLEAN, NOT a per-file list), the diff's
// engine-blocked "capability pending" detail, upstream-divergence labels shown
// only when an upstream is configured, and the keyboard disclosure — all through
// the REAL stores client transport (mockEngine), no component doubles. The git
// state is read through the stores seam (never the raw tiers block); git is NOT
// a tier, so availability tracks the presence of the git payload.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { MockEngine, MOCK_SCOPE } from "../../testing/mockEngine";
import { ChangesOverview } from "./ChangesOverview";

function renderChanges() {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ChangesOverview),
    ),
  );
}

describe("ChangesOverview git diff browser surface (S29, honest-against-live)", () => {
  beforeEach(() => {
    // Pin the active scope so useActiveScope resolves without the map/session
    // round-trip; the status query then runs against the mock.
    useViewStore.getState().setScope(MOCK_SCOPE);
    useViewStore.getState().select(null);
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
    useViewStore.getState().select(null);
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("renders the status header and an approachable clean-tree state when the working tree is clean", async () => {
    const mock = new MockEngine();
    mock.setGitDirty(false);
    engineClient.useTransport(mock.fetchImpl);
    renderChanges();
    // The status header shows branch + a labelled 'clean' pill (grayscale-safe).
    const header = await screen.findByLabelText("git status");
    expect(header.textContent).toMatch(/main/);
    expect(header.textContent).toMatch(/clean/i);
    // The clean-tree empty state reads in the warm copy tone, not as an error.
    await waitFor(() => {
      const clean = document.querySelector("[data-git-clean]");
      expect(clean?.textContent).toMatch(/working tree clean/i);
    });
    // There is NO fabricated changed-files list / working-changes panel.
    expect(document.querySelector("[data-working-changes]")).toBeNull();
  });

  it("renders the dirty working tree as an HONEST engine-blocked panel (no fabricated per-file list)", async () => {
    const mock = new MockEngine();
    mock.setGitDirty(true);
    engineClient.useTransport(mock.fetchImpl);
    renderChanges();
    // The header pill states 'changes' (not a fabricated count), label-reinforced.
    const header = await screen.findByLabelText("git status");
    expect(header.textContent).toMatch(/changes/i);
    // The working-changes panel states the per-file detail is not yet served.
    const panel = await waitFor(() => {
      const el = document.querySelector("[data-working-changes]");
      expect(el?.textContent).toMatch(/per-file detail not yet served/i);
      return el!;
    });
    // It is a labelled section, not a list of fabricated rows.
    expect(panel.getAttribute("aria-label")).toBe("working tree changes");
    expect(screen.queryByRole("list", { name: "changed files" })).toBeNull();
  });

  it("expands the engine-blocked panel to the diff's honest 'capability pending' detail", async () => {
    const mock = new MockEngine();
    mock.setGitDirty(true);
    engineClient.useTransport(mock.fetchImpl);
    renderChanges();
    const toggle = await waitFor(() => {
      const el = document.querySelector(
        "[data-working-changes] button",
      ) as HTMLButtonElement | null;
      expect(el).toBeTruthy();
      return el!;
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // The DiffView renders the engine-blocked state — NO network call to a
    // non-existent /ops/git/* endpoint, NO fake tier.
    const detail = await waitFor(() => {
      const el = document.querySelector("[data-diff-unavailable]");
      expect(el?.textContent).toMatch(/engine capability pending/i);
      return el!;
    });
    expect(detail).toBeTruthy();
    // It is NOT an error state.
    expect(document.querySelector("[data-diff-error]")).toBeNull();
  });

  it("shows divergence labels only when an upstream is configured (absent ahead/behind = no upstream, not zero)", async () => {
    const mock = new MockEngine();
    mock.setGitDirty(false);
    // No upstream → ahead/behind are absent (undefined), the live default.
    engineClient.useTransport(mock.fetchImpl);
    renderChanges();
    const header = await screen.findByLabelText("git status");
    // No upstream: NO ahead/behind readout at all (not "0 ahead").
    expect(header.querySelector('[aria-label$="ahead"]')).toBeNull();
    expect(header.querySelector('[aria-label$="behind"]')).toBeNull();
  });

  it("renders tabular ahead/behind labels when an upstream IS configured", async () => {
    const mock = new MockEngine();
    mock.setGitDirty(false);
    mock.setGitDivergence(2, 1);
    engineClient.useTransport(mock.fetchImpl);
    renderChanges();
    const header = await screen.findByLabelText("git status");
    // Divergence carries explicit ahead/behind labels (not arrows alone) for
    // grayscale + assistive-tech legibility.
    expect(header.querySelector('[aria-label="2 ahead"]')).toBeTruthy();
    expect(header.querySelector('[aria-label="1 behind"]')).toBeTruthy();
  });
});
