// @vitest-environment happy-dom
//
// Git diff browser surface adoption (W02.P13.S29): the ChangesOverview's full
// designed state machine — clean working tree, a populated changed-files list
// with an inline read-only diff, the engine-blocked "diff not yet available"
// degraded detail, the keyboard file-list contract, and the grayscale-safe
// non-colour diff cue (+/- glyphs and added/removed labels) — all exercised
// through the REAL stores client transport (mockEngine), with no component-
// internal doubles. The git working-tree state and the read-only diff are read
// through the stores seam (never the raw tiers block); selecting a vault file
// emits selectNode into the shared view store (cross-highlight on the stage).

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { engineClient, type GitFileDiff } from "../../stores/server/engine";
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

/** A structured diff fixture derived from the GitFileDiff contract (not copied
 *  from a broken run): one hunk with a context, a removed, and an added line. */
function sampleDiff(path: string): Omit<GitFileDiff, "tiers"> {
  return {
    path,
    status: "M",
    hunks: [
      {
        header: "@@ -1,3 +1,3 @@",
        lines: [
          { kind: "context", old: 1, new: 1, text: "unchanged line" },
          { kind: "remove", old: 2, new: null, text: "old line" },
          { kind: "add", old: null, new: 2, text: "new line" },
        ],
      },
    ],
  };
}

describe("ChangesOverview git diff browser surface (S29)", () => {
  beforeEach(() => {
    // Pin the active scope so useActiveScope resolves without the map/session
    // round-trip; the status + diff queries then run against the mock.
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
    mock.setGitDirty([]);
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
  });

  it("lists changed files with a non-colour status mark and the changed-count pill", async () => {
    const mock = new MockEngine();
    mock.setGitDirty(["M frontend/src/App.tsx", "?? scratch.md"]);
    engineClient.useTransport(mock.fetchImpl);
    renderChanges();
    const list = await screen.findByRole("list", { name: "changed files" });
    expect(list).toBeTruthy();
    // The changed-count pill carries the count with a label (never colour-only).
    const header = await screen.findByLabelText("git status");
    expect(header.textContent).toMatch(/2 changed/);
    // Each row's accessible name carries its status word + path (non-colour).
    const rows = screen
      .getAllByRole("button")
      .filter((b) => /modified|untracked/i.test(b.getAttribute("aria-label") ?? ""));
    expect(rows.length).toBe(2);
    expect(rows[0].getAttribute("aria-label")).toMatch(/modified.*App\.tsx/i);
  });

  it("expands a changed file to a read-only diff with +/- glyphs and added/removed labels (grayscale-safe)", async () => {
    const mock = new MockEngine();
    mock.setGitDirty(["M frontend/src/App.tsx"]);
    mock.setGitDiff("frontend/src/App.tsx", sampleDiff("frontend/src/App.tsx"));
    engineClient.useTransport(mock.fetchImpl);
    renderChanges();
    const row = await waitFor(() => {
      const found = screen
        .getAllByRole("button")
        .find((b) => /modified/i.test(b.getAttribute("aria-label") ?? ""));
      expect(found).toBeTruthy();
      return found!;
    });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    // The diff body renders the hunk with the sacred add/remove treatment.
    const body = await waitFor(() => {
      const el = document.querySelector("[data-diff-body]");
      expect(el).toBeTruthy();
      return el!;
    });
    // COLOUR IS NEVER THE SOLE SIGNAL: the added/removed lines carry the +/-
    // gutter glyph AND a programmatic ("added"/"removed") label readable in
    // grayscale and to assistive tech.
    expect(body.textContent).toContain("+");
    expect(body.textContent).toContain("-");
    expect(body.textContent).toMatch(/added/);
    expect(body.textContent).toMatch(/removed/);
    // The sacred diff tokens (never warmth-overridden) carry the colour signal.
    expect(body.querySelector(".text-diff-add")).toBeTruthy();
    expect(body.querySelector(".text-diff-remove")).toBeTruthy();
  });

  it("renders the designed 'diff not yet available' degraded detail when the read-only verb is unserved (engine-blocked), not an error", async () => {
    const mock = new MockEngine();
    mock.setGitDirty(["M frontend/src/App.tsx"]);
    // No registered diff body → the engine-blocked default: a tiers-bearing 502
    // the stores seam interprets as designed git-tier degradation.
    engineClient.useTransport(mock.fetchImpl);
    renderChanges();
    const row = await waitFor(() => {
      const found = screen
        .getAllByRole("button")
        .find((b) => /modified/i.test(b.getAttribute("aria-label") ?? ""));
      expect(found).toBeTruthy();
      return found!;
    });
    fireEvent.click(row);
    await waitFor(
      () => {
        const detail = document.querySelector("[data-diff-unavailable]");
        expect(detail?.textContent).toMatch(/not yet available/i);
      },
      { timeout: 4000 },
    );
    // It is NOT the transport-error branch.
    expect(document.querySelector("[data-diff-error]")).toBeNull();
  });

  it("moves changed-file focus with ArrowDown/ArrowUp (roving-tabindex keyboard contract)", async () => {
    const mock = new MockEngine();
    mock.setGitDirty(["M a.ts", "M b.ts", "M c.ts"]);
    engineClient.useTransport(mock.fetchImpl);
    renderChanges();
    const rows = await waitFor(() => {
      const found = screen
        .getAllByRole("button")
        .filter((b) => /modified/i.test(b.getAttribute("aria-label") ?? ""));
      expect(found.length).toBe(3);
      return found;
    });
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

  it("selecting a vault changed file emits selectNode into the shared view store (cross-highlight by stable id)", async () => {
    const mock = new MockEngine();
    mock.setGitDirty(["M .vault/plan/2026-06-12-foo-plan.md"]);
    engineClient.useTransport(mock.fetchImpl);
    renderChanges();
    const row = await waitFor(() => {
      const found = screen
        .getAllByRole("button")
        .find((b) => /modified.*foo-plan/i.test(b.getAttribute("aria-label") ?? ""));
      expect(found).toBeTruthy();
      return found!;
    });
    expect(useViewStore.getState().selectedId).toBeNull();
    fireEvent.click(row);
    // The shared selection now holds the document node id derived from the path
    // stem — the one model, reached by stable id (no surface-local navigation).
    expect(useViewStore.getState().selectedId).toBe("doc:2026-06-12-foo-plan");
  });

  it("renders divergence with tabular ahead/behind labels only when an upstream is configured", async () => {
    const mock = new MockEngine();
    mock.setGitDirty([]);
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
