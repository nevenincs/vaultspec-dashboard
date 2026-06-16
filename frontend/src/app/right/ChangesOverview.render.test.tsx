// @vitest-environment happy-dom
//
// Git diff browser surface (graph-viz-framework W06.P19): the ChangesOverview's
// state machine against the live engine's read-only `/ops/git` pass-through —
// clean working tree, the dirty working-tree state rendered as a status-grouped
// per-file changed-files list (parsed from porcelain status + numstat), the
// per-file diff revealed on disclosure (parsed from the unified-diff body),
// upstream-divergence labels shown only when an upstream is configured, and the
// keyboard disclosure — all through the REAL stores client transport (mockEngine),
// no component doubles. The git state is read through the stores seam (never the
// raw tiers block); git is NOT a tier, so availability tracks the presence of the
// git payload.

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
    // A clean tree renders NO per-file changed list.
    expect(document.querySelector("[data-working-changes]")).toBeNull();
  });

  it("renders the dirty working tree as a status-grouped per-file changed-files list (parsed from /ops/git)", async () => {
    const mock = new MockEngine();
    mock.setGitDirty(true);
    engineClient.useTransport(mock.fetchImpl);
    renderChanges();
    // The header pill states 'changes' (not a fabricated count), label-reinforced.
    const header = await screen.findByLabelText("git status");
    expect(header.textContent).toMatch(/changes/i);
    // The changed-files list is the real per-file list parsed from the porcelain
    // status (` M .vault/plan/...md`) the live engine forwards verbatim.
    const list = await screen.findByRole("list", { name: "changed files" });
    expect(list).toBeTruthy();
    // The dirty fixture file renders by basename under the Modified group.
    expect(list.textContent).toMatch(/Modified/);
    expect(list.textContent).toMatch(/2026-01-05-editor-demo-plan\.md/);
    // The status LETTER mark reads in grayscale (never colour-only).
    expect(list.querySelector('[aria-label^="modified"]')).toBeTruthy();
    // numstat tallies (3 added, 1 removed) render with the diff hues + labels.
    expect(list.querySelector('[aria-label="3 added"]')).toBeTruthy();
    expect(list.querySelector('[aria-label="1 removed"]')).toBeTruthy();
    // The vault corpus file carries a vault marker.
    expect(list.querySelector('[aria-label="vault file"]')).toBeTruthy();
  });

  it("expands a changed-file row to the real parsed diff (hunk body, +/- glyphs and labels)", async () => {
    const mock = new MockEngine();
    mock.setGitDirty(true);
    engineClient.useTransport(mock.fetchImpl);
    renderChanges();
    const toggle = await waitFor(() => {
      const el = document.querySelector(
        "[data-working-changes] li button",
      ) as HTMLButtonElement | null;
      expect(el).toBeTruthy();
      return el!;
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // The DiffView renders the REAL parsed diff body — the unified diff the
    // /ops/git/diff pass-through forwards, NOT an engine-blocked placeholder.
    const body = await waitFor(() => {
      const el = document.querySelector("[data-diff-body]");
      expect(el).toBeTruthy();
      return el!;
    });
    // The mock's diff carries a context, a removed, and an added line — the
    // sacred add/remove treatment with +/- glyphs and programmatic labels.
    expect(body.textContent).toMatch(/new line/);
    expect(body.textContent).toMatch(/old line/);
    expect(body.querySelector(".sr-only")?.textContent).toBeTruthy();
    // No engine-blocked placeholder survives anywhere on the surface.
    expect(document.querySelector("[data-diff-unavailable]")).toBeNull();
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
