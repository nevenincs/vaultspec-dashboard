// @vitest-environment happy-dom
//
// Menu host render + behaviour (W01.P03.S17): the host renders the singleton
// menu from a registered resolver, groups by section with separators, runs a
// non-confirm item and closes, arms-then-fires a destructive item, renders a
// disabled item with its reason, and light-dismisses on outside click.

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
import { copyAction } from "../../platform/actions/clipboardActions";
import { createTestLocalizationRuntime } from "../../localization/testing";
import {
  MenuTestProviders,
  createMenuTestQueryClient,
} from "../../testing/menuQueryClient";
import { openContextMenu, useContextMenuStore } from "../../stores/view/contextMenu";
import { clearActionFeedback } from "../../stores/view/actionFeedback";
import { ContextMenuHost } from "./ContextMenuHost";
import { ENGINE_WAIT } from "../../testing/timing";

// The host reads the active scope / selected node id (the unified-action-plane
// `ctx.selectedNodeId` thread) through TanStack query hooks, so the render must
// carry a (seeded, no-scope) QueryClient like every other store-backed surface.
let testClient: QueryClient;
let testLocalization: i18n;
function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={testLocalization}>
      <MenuTestProviders client={testClient}>{children}</MenuTestProviders>
    </I18nextProvider>
  );
}

let focusCount = 0;
let removeCount = 0;
const focus = () => {
  focusCount += 1;
};
const copy = () => undefined;
const remove = () => {
  removeCount += 1;
};

function registerNodeMenu() {
  registerResolver("node", () => [
    {
      id: "focus",
      label: { key: "common:actions.showOnCanvas" },
      section: "navigate",
      run: focus,
    },
    {
      id: "copy-id",
      label: { key: "common:actions.copy" },
      section: "copy",
      run: copy,
    },
    {
      id: "noop",
      label: { key: "common:actions.close" },
      section: "transform",
      disabled: true,
      disabledReason: { key: "common:disabledReasons.noRelation" },
    },
    {
      id: "remove",
      label: { key: "common:actions.open" },
      section: "danger",
      confirm: true,
      run: remove,
    },
  ]);
}

beforeEach(() => {
  testClient = createMenuTestQueryClient();
  testLocalization = createTestLocalizationRuntime();
  registerNodeMenu();
  clearActionFeedback();
});
afterEach(() => {
  cleanup();
  resetResolvers();
  useContextMenuStore.getState().closeMenu();
  testClient.clear();
  focusCount = 0;
  removeCount = 0;
  clearActionFeedback();
});

function openNodeMenu() {
  render(<ContextMenuHost />, { wrapper: Providers });
  act(() =>
    openContextMenu({ kind: "node", id: "n1", title: "Alpha" }, { x: 50, y: 50 }),
  );
}

const archiveConfirmation = {
  kind: "destructive" as const,
  title: {
    key: "features:confirmations.archive.title" as const,
    values: { feature: "Search" },
  },
  body: { key: "features:confirmations.archive.body" as const },
  confirmLabel: { key: "features:destructiveActions.archive" as const },
  cancelLabel: { key: "common:actions.cancel" as const },
};

describe("ContextMenuHost", () => {
  it("renders a labelled menu with the resolved items grouped into sections", async () => {
    openNodeMenu();
    const menu = await screen.findByRole("menu", undefined, ENGINE_WAIT);
    expect(menu.getAttribute("aria-label")).toBe("Actions");
    expect(screen.getByRole("menuitem", { name: /Show on canvas/ })).toBeTruthy();
    expect(screen.getByText("Copy")).toBeTruthy();
    expect(screen.getByText("Open")).toBeTruthy();
    // navigate, transform, copy, danger -> three separators between four groups.
    expect(menu.querySelectorAll('[role="separator"]').length).toBe(3);
  });

  it("runs a non-confirm item and closes the menu", async () => {
    openNodeMenu();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /Show on canvas/ }, ENGINE_WAIT),
    );
    expect(focusCount).toBe(1);
    expect(useContextMenuStore.getState().open).toBe(false);
  });

  it("arms a destructive item on first click and fires on the second", async () => {
    openNodeMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Open/ }, ENGINE_WAIT));
    expect(removeCount).toBe(0);
    const armed = (await screen.findAllByText("Confirm Open?"))[0]!.closest(
      '[role="menuitem"]',
    );
    fireEvent.click(armed as HTMLElement);
    expect(removeCount).toBe(1);
    expect(useContextMenuStore.getState().open).toBe(false);
  });

  it("returns focus to the pending row and later restores the original opener", async () => {
    resetResolvers();
    registerResolver("node", () => [
      {
        id: "focus",
        label: { key: "common:actions.showOnCanvas" },
        section: "navigate",
        run: focus,
      },
      {
        id: "archive",
        label: { key: "features:destructiveActions.archive" },
        section: "danger",
        confirmation: archiveConfirmation,
        run: remove,
      },
    ]);
    const opener = document.createElement("button");
    opener.textContent = "Open actions";
    document.body.appendChild(opener);
    render(<ContextMenuHost />, { wrapper: Providers });
    act(() => {
      opener.focus();
      openContextMenu({ kind: "node", id: "n1" }, { x: 50, y: 50 });
    });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Archive feature" }, ENGINE_WAIT),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(
      () =>
        expect(document.activeElement).toBe(
          screen.getByRole("menuitem", { name: "Archive feature" }),
        ),
      ENGINE_WAIT,
    );
    expect(useContextMenuStore.getState().cursor).toBe(1);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(document.activeElement).toBe(opener);
    opener.remove();
    expect(removeCount).toBe(0);
  });

  it("clears a typed confirmation when the current action disappears", async () => {
    resetResolvers();
    registerResolver("node", () => [
      {
        id: "focus",
        label: { key: "common:actions.showOnCanvas" },
        section: "navigate",
        run: focus,
      },
      {
        id: "archive",
        label: { key: "features:destructiveActions.archive" },
        section: "danger",
        confirmation: archiveConfirmation,
        disabledInTimeTravel: true,
        run: remove,
      },
    ]);
    const view = render(<ContextMenuHost timeTravel={false} />, {
      wrapper: Providers,
    });
    act(() => openContextMenu({ kind: "node", id: "n1" }, { x: 50, y: 50 }));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Archive feature" }, ENGINE_WAIT),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();

    view.rerender(<ContextMenuHost timeTravel />);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), ENGINE_WAIT);
    expect(await screen.findByRole("menu", undefined, ENGINE_WAIT)).toBeTruthy();
    await waitFor(
      () => expect(document.activeElement?.textContent).toContain("Show on canvas"),
      ENGINE_WAIT,
    );
    expect(removeCount).toBe(0);
  });

  it("keeps typed confirmation open across viewport dismissal events", async () => {
    resetResolvers();
    registerResolver("node", () => [
      {
        id: "archive",
        label: { key: "features:destructiveActions.archive" },
        section: "danger",
        confirmation: archiveConfirmation,
        run: remove,
      },
    ]);
    openNodeMenu();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Archive feature" }, ENGINE_WAIT),
    );

    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("blur"));

    expect(screen.getByRole("dialog", { name: "Archive Search?" })).toBeTruthy();
    expect(useContextMenuStore.getState().open).toBe(true);
    expect(removeCount).toBe(0);
  });

  it("fails closed before requesting a typed confirmation with unavailable copy", async () => {
    testLocalization.removeResourceBundle("en", "features");
    resetResolvers();
    registerResolver("node", () => [
      {
        id: "archive",
        // The label resolves from the still-present common bundle; only the typed
        // confirmation copy (features) is unavailable, so the action fails closed.
        label: { key: "common:actions.close" },
        section: "danger",
        confirmation: archiveConfirmation,
        run: remove,
      },
    ]);
    openNodeMenu();
    const archive = await screen.findByRole("menuitem", { name: "Close" }, ENGINE_WAIT);

    expect(archive.getAttribute("aria-disabled")).toBe("true");
    expect(archive.getAttribute("title")).toBe(
      "Reload the page and try this action again.",
    );
    fireEvent.click(archive);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(removeCount).toBe(0);
    expect(useContextMenuStore.getState().open).toBe(true);
  });

  it("fails closed when the catalog-owned legacy confirmation prompt is unavailable", async () => {
    testLocalization.removeResourceBundle("en", "common");
    resetResolvers();
    // The action label resolves from the still-present documents bundle; only the
    // confirm-prompt template (common:accessibility.confirmAction) is unavailable,
    // so arming fails closed.
    registerResolver("node", () => [
      {
        id: "remove",
        label: { key: "documents:editor.statuses.saved" },
        section: "danger",
        confirm: true,
        run: remove,
      },
    ]);
    openNodeMenu();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /Saved/ }, ENGINE_WAIT),
    );
    await waitFor(
      () =>
        expect(screen.queryByRole("menuitem", { name: "Confirm Saved?" })).toBeNull(),
      ENGINE_WAIT,
    );
    // The armed row falls closed: its confirm prompt is unavailable, so it renders
    // the safe fallback name (not "Confirm Saved?") and clicking it never fires.
    fireEvent.click(screen.getByRole("menuitem"));
    expect(removeCount).toBe(0);
    expect(useContextMenuStore.getState().open).toBe(true);
  });

  it("disarms when canonical time-travel state removes the armed action", async () => {
    resetResolvers();
    registerResolver("node", () => [
      {
        id: "focus",
        label: { key: "common:actions.showOnCanvas" },
        section: "navigate",
        run: focus,
      },
      {
        id: "remove",
        label: { key: "common:actions.open" },
        section: "danger",
        confirm: true,
        disabledInTimeTravel: true,
        run: remove,
      },
    ]);
    const view = render(<ContextMenuHost />, { wrapper: Providers });
    act(() => openContextMenu({ kind: "node", id: "n1" }, { x: 10, y: 10 }));

    fireEvent.click(await screen.findByRole("menuitem", { name: /Open/ }, ENGINE_WAIT));
    expect(useContextMenuStore.getState().armedItemId).toBe("remove");

    view.rerender(<ContextMenuHost timeTravel />);

    expect(screen.queryByText("Confirm Open?")).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Open/ })).toBeNull();
    expect(useContextMenuStore.getState().armedItemId).toBeNull();
    expect(useContextMenuStore.getState().open).toBe(true);
  });

  it("renders a disabled item with its reason and does not run it", async () => {
    openNodeMenu();
    const item = (await screen.findByText("Close", undefined, ENGINE_WAIT)).closest(
      '[role="menuitem"]',
    );
    expect(item?.getAttribute("aria-disabled")).toBe("true");
    expect(item?.getAttribute("title")).toBe("No relation");
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
        label: { key: "common:actions.cancel" },
        section: "transform",
        dispatch: { type: "contextmenu:does-not-exist" },
      },
    ]);
    render(<ContextMenuHost />, { wrapper: Providers });
    act(() =>
      openContextMenu({ kind: "node", id: "n1", title: "Alpha" }, { x: 10, y: 10 }),
    );
    // Activation must not throw inside the event handler; the menu just closes.
    expect(() =>
      fireEvent.click(screen.getByRole("menuitem", { name: /Cancel/ })),
    ).not.toThrow();
    expect(useContextMenuStore.getState().open).toBe(false);
  });

  it("announces an async outcome after close and resolves it again when locale changes", async () => {
    resetResolvers();
    registerResolver("node", () => [
      copyAction({
        id: "copy-title",
        label: { key: "common:actions.copyTitle" },
        text: "Alpha",
        what: "title",
      }),
    ]);
    openNodeMenu();

    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Copy title" }, ENGINE_WAIT),
    );
    expect(useContextMenuStore.getState().open).toBe(false);

    const feedback = document.querySelector("[data-action-feedback]");
    await waitFor(() => expect(feedback?.textContent).toBe("Copied."), ENGINE_WAIT);

    await act(async () => testLocalization.changeLanguage("fr"));
    const french = testLocalization.t("common:feedback.copySucceeded");
    await waitFor(() => expect(feedback?.textContent).toBe(french), ENGINE_WAIT);
    expect(french).not.toBe("Copied.");
  });
});
