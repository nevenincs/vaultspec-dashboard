// @vitest-environment happy-dom
//
// Seam-transit discipline (W05.P12.S54, actions-dispatch-through-the-one-seam):
// a menu action that mutates dispatches through the appDispatcher seam and is
// resolved by a registered terminal handler - never by a direct engine call from
// the menu. This proves the codification candidate end-to-end: the menu's only
// path to an effect is the seam (logged, traced, guardable).

import type { QueryClient } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerResolver, resetResolvers } from "../../platform/actions/registry";
import { appDispatcher } from "../../platform/dispatch/middleware";
import {
  MenuTestProviders,
  createMenuTestQueryClient,
} from "../../testing/menuQueryClient";
import { openContextMenu, useContextMenuStore } from "../../stores/view/contextMenu";
import { ContextMenuHost } from "./ContextMenuHost";

// The host reads active scope / selected node id through TanStack query hooks.
let testClient: QueryClient;
function Providers({ children }: { children: ReactNode }) {
  return <MenuTestProviders client={testClient}>{children}</MenuTestProviders>;
}

const TEST_VERB = "test:mutate";
const handler = vi.fn();

beforeEach(() => {
  testClient = createMenuTestQueryClient();
  handler.mockReset();
  appDispatcher.register(TEST_VERB, handler);
  registerResolver("node", (entity) => [
    {
      id: "mutate",
      label: "Mutate",
      section: "transform",
      dispatch: { type: TEST_VERB, payload: { id: entity.id } },
    },
  ]);
});
afterEach(() => {
  cleanup();
  resetResolvers();
  useContextMenuStore.getState().closeMenu();
  testClient.clear();
  vi.restoreAllMocks();
});

describe("menu seam transit", () => {
  it("routes a dispatch action through appDispatcher to its terminal handler", async () => {
    const dispatchSpy = vi.spyOn(appDispatcher, "dispatch");
    render(<ContextMenuHost />, { wrapper: Providers });
    act(() => openContextMenu({ kind: "node", id: "n1" }, { x: 5, y: 5 }));
    fireEvent.click(await screen.findByText("Mutate"));

    // The terminal handler fired exactly once, with the action that transited
    // the seam (so it was logged/traced/guardable in one place).
    expect(handler).toHaveBeenCalledTimes(1);
    const action = handler.mock.calls[0][0];
    expect(action.type).toBe(TEST_VERB);
    expect(action.payload).toEqual({ id: "n1" });
    // The menu dispatched through appDispatcher (not a direct engine call).
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: TEST_VERB, payload: { id: "n1" } }),
    );
  });
});
