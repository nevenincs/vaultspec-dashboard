// @vitest-environment happy-dom
//
// Menu host render + behaviour (W01.P03.S17): the host renders the singleton
// menu from a registered resolver, groups by section with separators, runs a
// non-confirm item and closes, arms-then-fires a destructive item, renders a
// disabled item with its reason, and light-dismisses on outside click.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerResolver, resetResolvers } from "../../platform/actions/registry";
import { openContextMenu, useContextMenuStore } from "../../stores/view/contextMenu";
import { useViewStore } from "../../stores/view/viewStore";
import { ContextMenuHost } from "./ContextMenuHost";

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
  useViewStore.getState().setTimelineMode({ kind: "live" });
  registerNodeMenu();
});
afterEach(() => {
  cleanup();
  resetResolvers();
  useContextMenuStore.getState().closeMenu();
  focus.mockReset();
  copy.mockReset();
  remove.mockReset();
});

function openNodeMenu() {
  render(<ContextMenuHost />);
  act(() =>
    openContextMenu({ kind: "node", id: "n1", title: "Alpha" }, { x: 50, y: 50 }),
  );
}

describe("ContextMenuHost", () => {
  it("renders a labelled menu with the resolved items grouped into sections", async () => {
    openNodeMenu();
    const menu = await screen.findByRole("menu");
    expect(menu.getAttribute("aria-label")).toBe("node actions");
    expect(screen.getByText("Focus Alpha")).toBeTruthy();
    expect(screen.getByText("Copy id")).toBeTruthy();
    expect(screen.getByText("Remove")).toBeTruthy();
    // navigate, transform, copy, danger -> three separators between four groups.
    expect(menu.querySelectorAll('[role="separator"]').length).toBe(3);
  });

  it("runs a non-confirm item and closes the menu", async () => {
    openNodeMenu();
    fireEvent.click(await screen.findByText("Focus Alpha"));
    expect(focus).toHaveBeenCalledTimes(1);
    expect(useContextMenuStore.getState().open).toBe(false);
  });

  it("arms a destructive item on first click and fires on the second", async () => {
    openNodeMenu();
    fireEvent.click(await screen.findByText("Remove"));
    expect(remove).not.toHaveBeenCalled();
    const armed = await screen.findByText("confirm Remove?");
    fireEvent.click(armed);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(useContextMenuStore.getState().open).toBe(false);
  });

  it("renders a disabled item with its reason and does not run it", async () => {
    openNodeMenu();
    const item = (await screen.findByText("Unavailable")).closest('[role="menuitem"]');
    expect(item?.getAttribute("aria-disabled")).toBe("true");
    expect(item?.getAttribute("title")).toBe("nothing to do");
    fireEvent.click(item as HTMLElement);
    // Disabled: not runnable, menu stays open.
    expect(useContextMenuStore.getState().open).toBe(true);
  });

  it("light-dismisses on an outside click", async () => {
    openNodeMenu();
    await screen.findByRole("menu");
    const catcher = document.querySelector(".fixed.inset-0") as HTMLElement;
    fireEvent.mouseDown(catcher);
    expect(useContextMenuStore.getState().open).toBe(false);
  });

  it("closes on Escape", async () => {
    openNodeMenu();
    const menu = await screen.findByRole("menu");
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
    render(<ContextMenuHost />);
    act(() =>
      openContextMenu({ kind: "node", id: "n1", title: "Alpha" }, { x: 10, y: 10 }),
    );
    // Activation must not throw inside the event handler; the menu just closes.
    expect(() => fireEvent.click(screen.getByText("Unregistered verb"))).not.toThrow();
    expect(useContextMenuStore.getState().open).toBe(false);
  });
});
