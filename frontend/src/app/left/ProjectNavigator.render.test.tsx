// @vitest-environment happy-dom
//
// The project navigator popup ("Project: Browse or Switch") rendered against the
// REAL engine over the fixture vault (app client bound live in liveSetup). It
// covers the open/closed disclosure and the always-present management chrome
// (Open project / Clear history); the cross-project history CONTENT is data-driven
// (the engine's recent_scopes), so these assertions stay on the deterministic shell.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import {
  closeProjectNavigator,
  openProjectNavigator,
} from "../../stores/view/projectNavigatorChrome";
import { liveScope } from "../../testing/liveClient";
import { ProjectNavigator } from "./ProjectNavigator";
import { ENGINE_WAIT } from "../../testing/timing";

function renderNavigator() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectNavigator />
    </QueryClientProvider>,
  );
}

describe("ProjectNavigator popup (live engine)", () => {
  let scope: string;
  beforeAll(async () => {
    scope = await liveScope();
  });
  beforeEach(() => {
    closeProjectNavigator();
    useViewStore.getState().setScope(scope);
  });
  afterEach(() => {
    cleanup();
    closeProjectNavigator();
    queryClient.clear();
    useViewStore.getState().setScope(null);
  });

  it("renders nothing while closed", () => {
    renderNavigator();
    expect(screen.queryByRole("dialog", { name: /switch project/i })).toBeNull();
  });

  it("opens as a modal with the history-management chrome", async () => {
    openProjectNavigator();
    renderNavigator();
    expect(
      await screen.findByRole("dialog", { name: /switch project/i }, ENGINE_WAIT),
    ).toBeTruthy();
    // The management affordances are always present: register/open a project and
    // clear the whole history (the CRUD surface).
    expect(screen.getByRole("button", { name: /open project/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /clear project history/i })).toBeTruthy();
  });
});
