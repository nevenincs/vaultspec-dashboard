// @vitest-environment happy-dom
//
// The first-run onboarding empty state (single-app-runtime ADR D4). WIRE-FREE
// UI unit tests, mirroring `ProvisionPanel`'s split:
// `resolveFirstRunOnboardingState` drives the resolution off injected inputs
// (no fetch), and `FirstRunOnboardingBody` takes an injected callback as a
// prop, so the render assertions never touch the engine wire.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceRoot, WorkspacesState } from "../../stores/server/engine";
import {
  FirstRunOnboardingBody,
  resolveFirstRunOnboardingState,
} from "./FirstRunOnboarding";

afterEach(cleanup);

function root(overrides: Partial<WorkspaceRoot> = {}): WorkspaceRoot {
  return {
    id: "wt-1",
    label: "main",
    path: "/repo",
    is_launch: true,
    reachable: true,
    unreachable_reason: null,
    ...overrides,
  };
}

function workspaces(overrides: Partial<WorkspacesState> = {}): WorkspacesState {
  return {
    workspaces: [root()],
    active_workspace: "wt-1",
    tiers: {},
    ...overrides,
  };
}

describe("resolveFirstRunOnboardingState", () => {
  it("stays hidden while the registry read is in flight — never a false first-run flash", () => {
    expect(
      resolveFirstRunOnboardingState({
        isPending: true,
        isError: false,
        data: undefined,
      }),
    ).toEqual({ kind: "hidden" });
  });

  it("stays hidden on a genuine read failure — never guessed from a bare transport error", () => {
    expect(
      resolveFirstRunOnboardingState({
        isPending: false,
        isError: true,
        data: undefined,
      }),
    ).toEqual({ kind: "hidden" });
  });

  it("stays hidden once at least one project is registered", () => {
    expect(
      resolveFirstRunOnboardingState({
        isPending: false,
        isError: false,
        data: workspaces(),
      }),
    ).toEqual({ kind: "hidden" });
  });

  it("resolves onboarding for a genuinely empty registry", () => {
    expect(
      resolveFirstRunOnboardingState({
        isPending: false,
        isError: false,
        data: workspaces({ workspaces: [], active_workspace: null }),
      }),
    ).toEqual({ kind: "onboarding" });
  });
});

describe("FirstRunOnboardingBody", () => {
  it("renders the welcome card with the add-project affordance", () => {
    render(<FirstRunOnboardingBody onAddProject={vi.fn()} />);
    expect(screen.getByText("Welcome to vaultspec")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add your first project" })).toBeTruthy();
  });

  it("clicking the affordance fires onAddProject", () => {
    const onAddProject = vi.fn();
    render(<FirstRunOnboardingBody onAddProject={onAddProject} />);
    fireEvent.click(screen.getByRole("button", { name: "Add your first project" }));
    expect(onAddProject).toHaveBeenCalledTimes(1);
  });
});
