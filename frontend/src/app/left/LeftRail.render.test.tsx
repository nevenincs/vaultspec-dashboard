// @vitest-environment happy-dom
//
// Left-rail integration adoption (dashboard-left-rail plan P05.S14 + S16): the
// COMPOSED rail renders its ordered hosted-slot stack end-to-end — WorkspacePicker
// (workspace) → WorktreePicker (worktree) → BrowserRegion (vault|code + filter) —
// under ONE labelled navigation landmark, with the slots in coarse-to-fine
// top-to-bottom order, and the read-only navigation law holds with NO mutation
// affordance and NO rail-local fetch escape hatch.
//
// Exercised through the REAL stores client transport (mockEngine) — no
// component-internal doubles. The rail reads `/workspaces`, `/map`, and
// `/vault-tree` through the stores hooks the same way it does in production; the
// test never fakes a hook.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { useBrowserModeStore } from "../../stores/view/browserMode";
import { useViewStore } from "../../stores/view/viewStore";
import { MockEngine, MOCK_SCOPE } from "../../testing/mockEngine";
import { LeftRail } from "./LeftRail";

function renderRail() {
  return render(
    <QueryClientProvider client={queryClient}>
      <LeftRail />
    </QueryClientProvider>,
  );
}

describe("LeftRail composition (ordered hosted-slot stack + read-only law)", () => {
  beforeEach(() => {
    // Pin the active scope so useActiveScope resolves without the map/session
    // round-trip; the browser query then runs against the mock.
    useViewStore.getState().setScope(MOCK_SCOPE);
    useViewStore.getState().select(null);
    useBrowserModeStore.getState().resetForScope();
    engineClient.useTransport(new MockEngine().fetchImpl);
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
    useViewStore.getState().select(null);
    useBrowserModeStore.getState().resetForScope();
    engineClient.useTransport((input, init) => fetch(input, init));
    vi.restoreAllMocks();
  });

  // --- P05.S14: ordered stack renders under one landmark, coarse-to-fine ----------

  it("renders the rail as ONE labelled navigation landmark", async () => {
    renderRail();
    const rail = await screen.findByRole("navigation", { name: "scope rail" });
    expect(rail).toBeTruthy();
    expect(rail.getAttribute("data-left-rail")).not.toBeNull();
  });

  it("hosts the three slots in coarse-to-fine top-to-bottom order", async () => {
    renderRail();
    await screen.findByRole("navigation", { name: "scope rail" });
    const slots = [...document.querySelectorAll("[data-rail-slot]")].map((el) =>
      el.getAttribute("data-rail-slot"),
    );
    // workspace (coarsest) → worktree → browser (finest): the ordering IS the
    // stateless-scope contract made physical.
    expect(slots).toEqual(["workspace", "worktree", "browser"]);
  });

  it("the browser region defaults to vault mode and renders the vault browser", async () => {
    renderRail();
    // The mode toggle is present (the kit SegmentedToggle radiogroup) and the
    // vault browser (default) renders.
    expect(
      await screen.findByRole("radiogroup", { name: "browser mode" }),
    ).toBeTruthy();
    expect(
      await screen.findByRole("navigation", { name: "vault browser" }),
    ).toBeTruthy();
    // The code browser is NOT mounted in the default mode.
    expect(screen.queryByRole("navigation", { name: "code browser" })).toBeNull();
  });

  it("toggling the mode swaps the vault browser for the code browser (P02)", async () => {
    renderRail();
    await screen.findByRole("navigation", { name: "vault browser" });
    // The kit SegmentedToggle renders each mode as a radio; selecting "Code"
    // swaps the listing for the code browser.
    fireEvent.click(screen.getByRole("radio", { name: /code/i }));
    expect(
      await screen.findByRole("navigation", { name: "code browser" }),
    ).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "vault browser" })).toBeNull();
  });

  it("the in-rail filter is present and visibly distinct from the global search (P03)", async () => {
    renderRail();
    await screen.findByRole("navigation", { name: "vault browser" });
    // The filter is now the kit SearchField; its input carries the kit data hook.
    const filter = document.querySelector("[data-kit-search-input]");
    expect(filter).toBeTruthy();
    // The placeholder names the client-side narrowing ("Filter documents…"), NOT
    // "search" — the deliberate distinction from the global right-rail search pillar.
    expect(filter?.getAttribute("placeholder")).toMatch(/^filter/i);
    expect(filter?.getAttribute("placeholder")).not.toMatch(/search/i);
  });

  // --- P05.S16: the read-only navigation law has no escape hatch ------------------

  it("exposes NO git/disk/vault mutation affordance anywhere in the rail", async () => {
    renderRail();
    await screen.findByRole("navigation", { name: "scope rail" });
    // Every interactive control in the rail must be a navigation/affordance
    // control — never a mutation verb. Scan all button accessible names for the
    // forbidden git/disk/vault mutation vocabulary the read-only law bars.
    const FORBIDDEN =
      /\b(checkout|commit|stage|discard|push|pull|merge|rebase|delete|remove|create branch|new branch|worktree add|init|clone|write|save file|rm)\b/i;
    const buttons = [...document.querySelectorAll("button")];
    for (const b of buttons) {
      const name = `${b.getAttribute("aria-label") ?? ""} ${b.textContent ?? ""}`;
      expect(
        FORBIDDEN.test(name),
        `mutation-shaped control leaked into the rail: "${name.trim()}"`,
      ).toBe(false);
    }
  });

  it("issues NO wire request when the in-rail filter changes (client-side only)", async () => {
    // Spy on the live transport: typing in the filter must NOT add a fetch.
    const seen: string[] = [];
    const mock = new MockEngine().fetchImpl;
    engineClient.useTransport((input, init) => {
      seen.push(String(input));
      return mock(input, init);
    });
    renderRail();
    await screen.findByRole("navigation", { name: "vault browser" });
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    const before = seen.length;
    // Type into the in-rail filter (the kit SearchField input).
    fireEvent.change(document.querySelector("[data-kit-search-input]")!, {
      target: { value: "left-rail" },
    });
    // Give any (erroneous) query a tick to fire — it must not.
    await new Promise((r) => setTimeout(r, 30));
    expect(seen.length).toBe(before);
  });
});
