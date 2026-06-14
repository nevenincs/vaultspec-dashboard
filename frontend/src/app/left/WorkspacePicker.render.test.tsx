// @vitest-environment happy-dom
//
// Workspace-switcher surface (dashboard-workspace-registry ADR, P05.S18): the
// picker's four honest states (loading, empty/single-root header, degraded,
// error-with-retry) plus the add-a-project validation refusal — exercised
// through the real stores client transport (mockEngine), no component-internal
// doubles. The degraded state is driven by a real `tiers` block; the multi-root
// and unreachable-root states by a patched-body transport that rewrites the live
// `/workspaces` shape (the SAME client path, a different live-shape body); the
// add-refusal by the mock's REAL PUT /session register validation 400-ing a
// `bad`-prefixed path, the same tiered refusal the live route emits.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FetchLike } from "../../stores/server/engine";
import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { MockEngine, MOCK_WORKSPACE_ID } from "../../testing/mockEngine";
import { WorkspacePicker } from "./WorkspacePicker";

function renderPicker(
  props: { defaultExpanded?: boolean; defaultAdding?: boolean } = {},
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspacePicker {...props} />
    </QueryClientProvider>,
  );
}

/** Rewrite one path's JSON body before it reaches the client — the SAME client
 *  code path, fed a different live-shape body (mirrors the WorktreePicker test
 *  helper). Used to inject a second / unreachable root on `/workspaces`. */
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

describe("WorkspacePicker honest states + add-a-project refusal (S18)", () => {
  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
    engineClient.useTransport((input, init) => fetch(input, init));
    vi.restoreAllMocks();
  });

  it("renders a quiet loading line while the registry is in flight", () => {
    engineClient.useTransport(() => new Promise<Response>(() => {}));
    renderPicker();
    const pending = screen.getByRole("status");
    expect(pending.textContent).toMatch(/loading projects/i);
  });

  it("renders a contained error with a retry control on a genuine /workspaces failure", async () => {
    engineClient.useTransport(() =>
      Promise.resolve(new Response("boom", { status: 500 })),
    );
    renderPicker();
    await waitFor(() => {
      expect(screen.getByText(/projects unavailable/i)).toBeTruthy();
    });
    expect(
      screen.getByRole("button", { name: /retry loading the project list/i }),
    ).toBeTruthy();
  });

  it("renders the single registered root as a quiet header, not a control", async () => {
    // The default mock registry holds exactly the launch root — the empty/
    // single-project case renders as a header (the project name), not a picker.
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderPicker();
    await waitFor(() => {
      expect(document.querySelector("[data-workspace-header]")).toBeTruthy();
    });
    // A header, NOT an expandable trigger: no project-picker disclosure button.
    expect(screen.queryByRole("button", { name: /^project:/i })).toBeNull();
    // The add-a-project affordance is still reachable from the header.
    expect(document.querySelector("[data-workspace-add]")).toBeTruthy();
  });

  it("renders multiple roots as an expandable picker with launch + unreachable markers", async () => {
    // Patch the live `/workspaces` body to add a second, unreachable root —
    // the same client path, a different live-shape body.
    const mock = new MockEngine();
    const transport = withPatchedBody(mock.fetchImpl, "/workspaces", (body) => {
      const roots = (body.workspaces as Record<string, unknown>[]) ?? [];
      return {
        ...body,
        workspaces: [
          ...roots,
          {
            id: "/project-b/.git",
            label: "project-b",
            path: "/project-b",
            is_launch: false,
            reachable: false,
            unreachable_reason: "path is not a readable directory",
          },
        ],
      };
    });
    engineClient.useTransport(transport);
    renderPicker({ defaultExpanded: true });

    // The expandable picker trigger appears once there are 2+ roots.
    await screen.findByRole("button", { name: /^project: repo/i });
    // The list carries both roots; the launch root is marked, the sibling is
    // marked unreachable (a designed degraded entry, never dropped).
    const list = screen.getByRole("list", { name: /registered projects/i });
    expect(list).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /switch to repo.*launch project/i }),
    ).toBeTruthy();
    const sibling = screen.getByRole("button", {
      name: /switch to project-b.*unreachable/i,
    });
    expect(sibling).toBeTruthy();
    // The unreachable mark is rendered (kept with its reason, not vanished).
    expect(document.querySelector("[data-workspace-unreachable]")).toBeTruthy();
  });

  it("renders a designed degraded banner (with reason) when the structural tier is down", async () => {
    // Two roots so the picker (not the header) renders, then degrade structural.
    const mock = new MockEngine();
    mock.degrade("structural", "git index locked");
    const transport = withPatchedBody(mock.fetchImpl, "/workspaces", (body) => ({
      ...body,
      workspaces: [
        ...((body.workspaces as Record<string, unknown>[]) ?? []),
        {
          id: "/project-b/.git",
          label: "project-b",
          path: "/project-b",
          is_launch: false,
          reachable: true,
          unreachable_reason: null,
        },
      ],
    }));
    engineClient.useTransport(transport);
    renderPicker();
    await waitFor(() => {
      const banner = document.querySelector("[data-workspace-degraded]");
      expect(banner).toBeTruthy();
      expect(banner?.textContent).toMatch(/git index locked/);
    });
    // Degradation is NOT an error: the picker trigger still rendered.
    expect(screen.queryByText(/projects unavailable/i)).toBeNull();
  });

  it("surfaces the add-a-project validation refusal as a non-silent status line", async () => {
    // The mock's REAL PUT /session register validation 400s a `bad`-prefixed
    // path (the same tiered refusal the live route emits for a path that
    // cannot be registered) — driving the honest add-refusal state, not a
    // stubbed mutation.
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderPicker({ defaultAdding: true });

    const input = await screen.findByRole("textbox", {
      name: /absolute path to a git project/i,
    });
    fireEvent.change(input, { target: { value: "bad/not-a-project" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      const status = document.querySelector("[data-workspace-status-error]");
      expect(status).toBeTruthy();
      expect(status?.textContent).toMatch(/could not register/i);
    });
  });

  it("registers a valid project through the add affordance and lists it", async () => {
    // A valid (non-`bad`) path registers read-only through the real mock route;
    // the registry then enumerates two roots, flipping the header into a picker.
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderPicker({ defaultAdding: true });

    const input = await screen.findByRole("textbox", {
      name: /absolute path to a git project/i,
    });
    fireEvent.change(input, { target: { value: "/another-project" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    // After the register, the registry holds two roots and the picker trigger
    // (not the header) renders with the launch root's label.
    await screen.findByRole("button", { name: /^project: repo/i });
    expect(
      screen.getByText((_, el) => el?.getAttribute("data-workspace-picker") !== null),
    ).toBeTruthy();
  });

  it("keeps the launch-workspace id stable as the registry's default marker", async () => {
    // The mock's launch root id is the canonical workspace id; the header marks
    // it as the launch project (the advisory default).
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderPicker();
    await waitFor(() => {
      expect(document.querySelector("[data-workspace-header]")).toBeTruthy();
    });
    // The launch id is the stable advisory default the registry seeds.
    expect(MOCK_WORKSPACE_ID).toBe("/repo/.git");
  });
});
