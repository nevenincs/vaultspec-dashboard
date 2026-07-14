// @vitest-environment happy-dom
//
// Menu host interactive contract (W05.P12.S53): keyboard navigation, activation,
// dismiss, and focus management (capture on open, restore on close AND on
// unmount-while-open, the M1 hardening). The pure resolver + slice transitions
// are covered elsewhere; this exercises the host's a11y/keyboard behaviour.

import type { QueryClient } from "@tanstack/react-query";
import type { i18n } from "i18next";
import { I18nextProvider } from "react-i18next";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerResolver, resetResolvers } from "../../platform/actions/registry";
import { createTestLocalizationRuntime } from "../../localization/testing";
import {
  MenuTestProviders,
  createMenuTestQueryClient,
} from "../../testing/menuQueryClient";
import { openContextMenu, useContextMenuStore } from "../../stores/view/contextMenu";
import { ContextMenuHost } from "./ContextMenuHost";
import { ENGINE_WAIT } from "../../testing/timing";

// The host reads active scope / selected node id through TanStack query hooks.
let testClient: QueryClient;
let testLocalization: i18n;
function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={testLocalization}>
      <MenuTestProviders client={testClient}>{children}</MenuTestProviders>
    </I18nextProvider>
  );
}

let firstCount = 0;
let secondCount = 0;
const first = () => {
  firstCount += 1;
};
const second = () => {
  secondCount += 1;
};

beforeEach(() => {
  testClient = createMenuTestQueryClient();
  testLocalization = createTestLocalizationRuntime();
  registerResolver("node", () => [
    { id: "first", label: "First", section: "navigate", run: first },
    { id: "second", label: "Second", section: "navigate", run: second },
  ]);
});
afterEach(() => {
  cleanup();
  resetResolvers();
  useContextMenuStore.getState().closeMenu();
  testClient.clear();
  firstCount = 0;
  secondCount = 0;
});

function openAt(trigger?: HTMLElement) {
  render(<ContextMenuHost />, { wrapper: Providers });
  act(() => {
    trigger?.focus();
    openContextMenu({ kind: "node", id: "n1", title: "Alpha" }, { x: 20, y: 20 });
  });
}

describe("ContextMenuHost interactive", () => {
  it("moves focus to the first item on open", async () => {
    openAt();
    await waitFor(
      () => expect(document.activeElement?.textContent).toContain("First"),
      ENGINE_WAIT,
    );
  });

  it("ArrowDown/ArrowUp walk the items via roving focus", async () => {
    openAt();
    const menu = await screen.findByRole("menu", undefined, ENGINE_WAIT);
    await waitFor(
      () => expect(document.activeElement?.textContent).toContain("First"),
      ENGINE_WAIT,
    );
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    await waitFor(
      () => expect(document.activeElement?.textContent).toContain("Second"),
      ENGINE_WAIT,
    );
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    await waitFor(
      () => expect(document.activeElement?.textContent).toContain("First"),
      ENGINE_WAIT,
    );
  });

  it("Enter activates the focused item and closes", async () => {
    openAt();
    const menu = await screen.findByRole("menu", undefined, ENGINE_WAIT);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    await waitFor(
      () => expect(document.activeElement?.textContent).toContain("Second"),
      ENGINE_WAIT,
    );
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(secondCount).toBe(1);
    expect(firstCount).toBe(0);
    expect(useContextMenuStore.getState().open).toBe(false);
  });

  it("restores focus to the opener on Escape", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "opener";
    document.body.appendChild(trigger);
    openAt(trigger);
    const menu = await screen.findByRole("menu", undefined, ENGINE_WAIT);
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("restores focus when the host unmounts while open (M1)", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "opener";
    document.body.appendChild(trigger);
    const view = render(<ContextMenuHost />, { wrapper: Providers });
    act(() => {
      trigger.focus();
      openContextMenu({ kind: "node", id: "n1" }, { x: 10, y: 10 });
    });
    await screen.findByRole("menu", undefined, ENGINE_WAIT);
    view.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
