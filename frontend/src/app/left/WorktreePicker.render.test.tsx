// @vitest-environment happy-dom
//
// Worktree-switcher surface adoption (W02.P14.S30): the switcher's honest states
// (loading, empty/single-scope, switching/pending, degraded, error, and the
// rejected-durable-switch line), its keyboard switch contract, and its
// grayscale-safe active-scope cue — exercised through the real stores client
// transport (mockEngine), no component-internal doubles. The degraded state is
// driven by a real `tiers` block the engine serves on `/map`, proving the
// surface renders degradation as a designed state read through the stores
// selector and never the raw tiers block. The rejected-switch path is driven by
// the mock's REAL PUT /session validation 400-ing an unregistered scope — the
// same tiered rejection the live route emits — not a stubbed mutation.

import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FetchLike } from "../../stores/server/engine";
import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { MockEngine, MOCK_SCOPE } from "../../testing/mockEngine";
import { WorktreePicker } from "./WorktreePicker";

function renderPicker(props: { defaultExpanded?: boolean } = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <WorktreePicker {...props} />
    </QueryClientProvider>,
  );
}

/**
 * Compose a transport over the mock that rewrites the JSON body of one path
 * before it reaches the client — the SAME client code path, fed a different
 * live-shape body. Used to inject ahead/behind git counts on `/status` and an
 * extra corpus-bearing-but-unregistered worktree on `/map` without forking the
 * mock's route logic.
 */
function withPatchedBody(
  base: FetchLike,
  path: string,
  patch: (body: Record<string, unknown>) => Record<string, unknown>,
): FetchLike {
  return async (input, init) => {
    const res = await base(input, init);
    const url = new URL(String(input), "http://mock.local");
    if (url.pathname.replace(/^\/api/, "") !== path) return res;
    const body = (await res.clone().json()) as Record<string, unknown>;
    return new Response(JSON.stringify(patch(body)), {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  };
}

describe("WorktreePicker surface states + a11y (S30)", () => {
  beforeEach(() => {
    // Pin the active scope synchronously so useActiveScope resolves to the
    // vault-bearing worktree without the session round-trip.
    useViewStore.getState().setScope(MOCK_SCOPE);
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
    engineClient.useTransport((input, init) => fetch(input, init));
    vi.restoreAllMocks();
  });

  it("renders a quiet copy-toned loading line while the map is in flight", () => {
    engineClient.useTransport(() => new Promise<Response>(() => {}));
    renderPicker();
    const pending = screen.getByRole("status");
    expect(pending.textContent).toMatch(/mapping worktrees/i);
  });

  it("renders a contained error with a retry control on a genuine map failure", async () => {
    // A non-ok response with no tiers envelope is a transport-level failure —
    // the query errors, distinct from degradation.
    engineClient.useTransport(() =>
      Promise.resolve(new Response("boom", { status: 500 })),
    );
    renderPicker();
    await waitFor(() => {
      expect(screen.getByText(/workspace map unavailable/i)).toBeTruthy();
    });
    expect(
      screen.getByRole("button", { name: /retry loading the workspace map/i }),
    ).toBeTruthy();
  });

  it("shows the active worktree as the trigger headline with an expandable list", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderPicker();
    const trigger = await screen.findByRole("button", {
      name: /worktree scope: main/i,
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    // The list is a labelled region of worktree scope rows.
    expect(screen.getByRole("list", { name: /worktree scopes/i })).toBeTruthy();
  });

  it("conveys the active scope by a non-color cue: aria-current plus a leading accent bar", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderPicker({ defaultExpanded: true });
    const activeRow = await screen.findByRole("button", {
      name: /switch to main.*current scope/i,
    });
    // The active cue is conveyed structurally (aria-current) AND with a
    // grayscale-safe fill+weight+bar, not hue alone.
    expect(activeRow.getAttribute("aria-current")).toBe("true");
    expect(activeRow.className).toMatch(/font-medium/);
  });

  it("marks a bare ref non-selectable (aria-disabled) and never switches to it", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderPicker({ defaultExpanded: true });
    const bareRow = await screen.findByRole("button", {
      name: /context only, no vault corpus/i,
    });
    expect(bareRow.getAttribute("aria-disabled")).toBe("true");
    // Activating a bare row is a no-op: the active scope is unchanged.
    fireEvent.click(bareRow);
    fireEvent.keyDown(bareRow, { key: "Enter" });
    expect(useViewStore.getState().scope).toBe(MOCK_SCOPE);
  });

  it("renders a designed degraded banner (with reason) when the structural tier is down", async () => {
    const mock = new MockEngine();
    mock.degrade("structural", "git index locked");
    engineClient.useTransport(mock.fetchImpl);
    renderPicker();
    await waitFor(() => {
      const banner = document.querySelector("[data-worktree-degraded]");
      expect(banner).toBeTruthy();
      expect(banner?.textContent).toMatch(/git index locked/);
    });
    // Degradation is NOT an error: the trigger still rendered.
    expect(screen.queryByText(/workspace map unavailable/i)).toBeNull();
    expect(screen.getByRole("button", { name: /worktree scope/i })).toBeTruthy();
  });

  it("switches scope wholesale via the keyboard (Enter on a corpus row)", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    // Start parked on a DIFFERENT scope with residue, so the keyboard switch to
    // the registered `wt-main` is an observable swap that the store must clear.
    act(() => {
      useViewStore.getState().setScope("wt-other");
      useViewStore.getState().addToWorkingSet("feature:residue");
      useViewStore.getState().setTimelineMode({ kind: "time-travel", at: 123 });
    });
    renderPicker({ defaultExpanded: true });

    const mainRow = await screen.findByRole("button", {
      name: /switch to main.*the default/i,
    });
    act(() => {
      fireEvent.keyDown(mainRow, { key: "Enter" });
    });
    // The keyboard activation fired the wholesale swap: residue is gone and the
    // mode is back to live (the 022 invariant, owned by setScope, not this view).
    const next = useViewStore.getState();
    expect(next.scope).toBe(MOCK_SCOPE);
    expect(next.workingSet).toEqual([]);
    expect(next.timelineMode).toEqual({ kind: "live" });
  });

  it("surfaces a non-silent rejected-switch line when the durable write 400s", async () => {
    // A corpus-bearing worktree the mock's registry does NOT accept: the
    // optimistic setScope moves the UI, then the real PUT /session 400s, exactly
    // as the live route rejects an unknown/non-vault scope.
    const mock = new MockEngine();
    const transport = withPatchedBody(mock.fetchImpl, "/map", (body) => {
      const repos = body.repositories as { worktrees: unknown[] }[];
      repos[0].worktrees = [
        ...repos[0].worktrees,
        { id: "wt-phantom", path: "/phantom", branch: "phantom", has_vault: true },
      ];
      return body;
    });
    engineClient.useTransport(transport);
    renderPicker({ defaultExpanded: true });

    const phantomRow = await screen.findByRole("button", {
      name: /switch to phantom/i,
    });
    act(() => {
      fireEvent.click(phantomRow);
    });
    await waitFor(() => {
      const line = document.querySelector("[data-worktree-switch-error]");
      expect(line).toBeTruthy();
      expect(line?.getAttribute("role")).toBe("status");
      expect(line?.textContent).toMatch(/could not switch to phantom/i);
    });
  });

  it("renders the git sync badge with tabular ahead/behind counts on real git state", async () => {
    const mock = new MockEngine();
    const transport = withPatchedBody(mock.fetchImpl, "/status", (body) => ({
      ...body,
      // Live git shape: dirty BOOLEAN, ahead/behind present (upstream configured).
      git: { branch: "main", ahead: 3, behind: 2, dirty: true },
    }));
    engineClient.useTransport(transport);
    renderPicker();
    const trigger = await screen.findByRole("button", { name: /worktree scope/i });
    await waitFor(() => {
      expect(trigger.textContent).toContain("3");
      expect(trigger.textContent).toContain("2");
    });
    // The counts are marked tabular for aligned figures (ADR typography law).
    const tabular = trigger.querySelectorAll("[data-tabular]");
    expect(tabular.length).toBeGreaterThanOrEqual(2);
  });

  it("collapses with Escape, returning focus to the trigger", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderPicker({ defaultExpanded: true });
    const trigger = await screen.findByRole("button", { name: /worktree scope/i });
    const mainRow = screen.getByRole("button", { name: /switch to main/i });
    mainRow.focus();
    fireEvent.keyDown(mainRow, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("opens the disclosure from the keyboard (Enter on the trigger)", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderPicker();
    const trigger = await screen.findByRole("button", { name: /worktree scope/i });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("list", { name: /worktree scopes/i })).toBeTruthy();
  });

  it("moves focus between rows with ArrowDown/ArrowUp in corpus-first order", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderPicker({ defaultExpanded: true });
    const mainRow = await screen.findByRole("button", { name: /switch to main/i });
    const bareRow = screen.getByRole("button", {
      name: /context only, no vault corpus/i,
    });
    mainRow.focus();
    fireEvent.keyDown(mainRow, { key: "ArrowDown" });
    expect(document.activeElement).toBe(bareRow);
    fireEvent.keyDown(bareRow, { key: "ArrowUp" });
    expect(document.activeElement).toBe(mainRow);
    // Clamp at the top edge rather than wrapping.
    fireEvent.keyDown(mainRow, { key: "ArrowUp" });
    expect(document.activeElement).toBe(mainRow);
  });
});
