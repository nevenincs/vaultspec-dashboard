// @vitest-environment happy-dom
//
// Menu host render + behaviour (W01.P03.S17): the host renders the singleton
// menu from a registered resolver, groups by section with separators, runs a
// non-confirm item and closes, arms-then-fires a destructive item, renders a
// disabled item with its reason, and light-dismisses on outside click.

import type { QueryClient } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerResolver, resetResolvers } from "../../platform/actions/registry";
import {
  MenuTestProviders,
  createMenuTestQueryClient,
} from "../../testing/menuQueryClient";
import { openContextMenu, useContextMenuStore } from "../../stores/view/contextMenu";
import { ContextMenuHost } from "./ContextMenuHost";
import { ENGINE_WAIT } from "../../testing/timing";

// The host reads the active scope / selected node id (the unified-action-plane
// `ctx.selectedNodeId` thread) through TanStack query hooks, so the render must
// carry a (seeded, no-scope) QueryClient like every other store-backed surface.
let testClient: QueryClient;
function Providers({ children }: { children: ReactNode }) {
  return <MenuTestProviders client={testClient}>{children}</MenuTestProviders>;
}

const focus = vi.fn();
const copy = vi.fn();
const remove = vi.fn();

function registerNodeMenu() {
  registerResolver("node", (entity) => [
    {
      id: "focus",
      label: `Focus ${entity.title ?? entity.id}`,
      section: "navigate",
      run: focus,
    },
    { id: "copy-id", label: "Copy id", section: "copy", run: copy },
    {
      id: "noop",
      label: "Unavailable",
      section: "transform",
      disabled: true,
      disabledReason: "nothing to do",
    },
    { id: "remove", label: "Remove", section: "danger", confirm: true, run: remove },
  ]);
}

beforeEach(() => {
  testClient = createMenuTestQueryClient();
  registerNodeMenu();
});
afterEach(() => {
  cleanup();
  resetResolvers();
  useContextMenuStore.getState().closeMenu();
  testClient.clear();
  focus.mockReset();
  copy.mockReset();
  remove.mockReset();
});

function openNodeMenu() {
  render(<ContextMenuHost />, { wrapper: Providers });
  act(() =>
    openContextMenu({ kind: "node", id: "n1", title: "Alpha" }, { x: 50, y: 50 }),
  );
}

describe("ContextMenuHost", () => {
  it("renders a labelled menu with the resolved items grouped into sections", async () => {
    openNodeMenu();
    const menu = await screen.findByRole("menu", undefined, ENGINE_WAIT);
    expect(menu.getAttribute("aria-label")).toBe("node actions");
    expect(screen.getByText("Focus Alpha")).toBeTruthy();
    expect(screen.getByText("Copy id")).toBeTruthy();
    expect(screen.getByText("Remove")).toBeTruthy();
    // navigate, transform, copy, danger -> three separators between four groups.
    expect(menu.querySelectorAll('[role="separator"]').length).toBe(3);
  });

  it("runs a non-confirm item and closes the menu", async () => {
    openNodeMenu();
    fireEvent.click(await screen.findByText("Focus Alpha", undefined, ENGINE_WAIT));
    expect(focus).toHaveBeenCalledTimes(1);
    expect(useContextMenuStore.getState().open).toBe(false);
  });

  it("arms a destructive item on first click and fires on the second", async () => {
    openNodeMenu();
    fireEvent.click(await screen.findByText("Remove", undefined, ENGINE_WAIT));
    expect(remove).not.toHaveBeenCalled();
    const armed = (await screen.findAllByText("confirm Remove?"))[0]!.closest(
      '[role="menuitem"]',
    );
    fireEvent.click(armed as HTMLElement);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(useContextMenuStore.getState().open).toBe(false);
  });

  it("disarms when canonical time-travel state removes the armed action", async () => {
    resetResolvers();
    registerResolver("node", () => [
      {
        id: "focus",
        label: "Focus",
        section: "navigate",
        run: focus,
      },
      {
        id: "remove",
        label: "Remove",
        section: "danger",
        confirm: true,
        disabledInTimeTravel: true,
        run: remove,
      },
    ]);
    const view = render(<ContextMenuHost />, { wrapper: Providers });
    act(() => openContextMenu({ kind: "node", id: "n1" }, { x: 10, y: 10 }));

    fireEvent.click(await screen.findByText("Remove", undefined, ENGINE_WAIT));
    expect(useContextMenuStore.getState().armedItemId).toBe("remove");

    view.rerender(<ContextMenuHost timeTravel />);

    expect(screen.queryByText("confirm Remove?")).toBeNull();
    expect(screen.queryByText("Remove")).toBeNull();
    expect(useContextMenuStore.getState().armedItemId).toBeNull();
    expect(useContextMenuStore.getState().open).toBe(true);
  });

  it("renders a disabled item with its reason and does not run it", async () => {
    openNodeMenu();
    const item = (
      await screen.findByText("Unavailable", undefined, ENGINE_WAIT)
    ).closest('[role="menuitem"]');
    expect(item?.getAttribute("aria-disabled")).toBe("true");
    expect(item?.getAttribute("title")).toBe("nothing to do");
    fireEvent.click(item as HTMLElement);
    // Disabled: not runnable, menu stays open.
    expect(useContextMenuStore.getState().open).toBe(true);
  });

  it("light-dismisses on an outside click", async () => {
    openNodeMenu();
    await screen.findByRole("menu", undefined, ENGINE_WAIT);
    const catcher = document.querySelector(".fixed.inset-0") as HTMLElement;
    fireEvent.mouseDown(catcher);
    expect(useContextMenuStore.getState().open).toBe(false);
  });

  it("light-dismisses through the context-menu viewport lifecycle seam", async () => {
    openNodeMenu();
    await screen.findByRole("menu", undefined, ENGINE_WAIT);
    window.dispatchEvent(new Event("resize"));
    expect(useContextMenuStore.getState().open).toBe(false);
  });

  it("closes on Escape", async () => {
    openNodeMenu();
    const menu = await screen.findByRole("menu", undefined, ENGINE_WAIT);
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(useContextMenuStore.getState().open).toBe(false);
  });

  it("degrades a dispatch action with no registered handler instead of throwing (M2)", async () => {
    resetResolvers();
    registerResolver("node", () => [
      {
        id: "ghost",
        label: "Unregistered verb",
        section: "transform",
        dispatch: { type: "contextmenu:does-not-exist" },
      },
    ]);
    render(<ContextMenuHost />, { wrapper: Providers });
    act(() =>
      openContextMenu({ kind: "node", id: "n1", title: "Alpha" }, { x: 10, y: 10 }),
    );
    // Activation must not throw inside the event handler; the menu just closes.
    expect(() => fireEvent.click(screen.getByText("Unregistered verb"))).not.toThrow();
    expect(useContextMenuStore.getState().open).toBe(false);
  });
});
