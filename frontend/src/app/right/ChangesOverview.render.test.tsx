// @vitest-environment happy-dom
//
// Regression: the fold's `useLocalizedMessageResolver()` call sat AFTER the
// `noScope` early return, so the hook count for this component instance changed
// the moment the active scope resolved from null to a real value (rules of
// hooks) — a scope that starts unresolved and later lands, while this fold stays
// mounted, is the ordinary boot sequence, not an edge case.

import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { liveScope } from "../../testing/liveClient";
import { ENGINE_WAIT } from "../../testing/timing";
import { ChangesOverview } from "./ChangesOverview";

let scope: string;

beforeAll(async () => {
  scope = await liveScope();
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  useViewStore.getState().setScope(null);
});

afterAll(() => {
  useViewStore.getState().setScope(null);
});

describe("ChangesOverview (scope resolving while mounted)", () => {
  it("survives the active scope resolving from unset to a real value without crashing", async () => {
    // Cold mount BEFORE any scope is known — the surface's honest "no worktree
    // selected" state, and the render path that used to skip the resolver hook.
    render(
      createElement(QueryClientProvider, {
        client: queryClient,
        children: createElement(ChangesOverview),
      }),
    );

    expect(
      screen.getByText("No worktree selected — pick one in the left rail first."),
    ).toBeTruthy();

    // The scope lands (the ordinary boot sequence): this MUST NOT throw a
    // "rendered more hooks than during the previous render" error.
    await act(async () => {
      useViewStore.getState().setScope(scope);
    });

    // The fold's own header now renders in place of the no-scope paragraph.
    const toggle = await screen.findByRole(
      "button",
      {
        name: /changed|no changes|reading changes|repository state unavailable|changes unavailable/i,
      },
      ENGINE_WAIT,
    );
    expect(toggle).toBeTruthy();
  });
});
