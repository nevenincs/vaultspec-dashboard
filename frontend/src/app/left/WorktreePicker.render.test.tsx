// @vitest-environment happy-dom
//
// Worktree-switcher surface (W02.P14.S30) rendered against the REAL engine over
// the fixture vault (app client bound live in liveSetup). These cover the loaded
// disclosure contract: the active-worktree trigger headline, the expandable
// labelled list, the grayscale-safe active-scope cue (aria-current + weight), and
// the keyboard open/collapse + focus-return.
//
// The MULTI-worktree behaviours (switch wholesale, bare-ref non-selectable,
// rejected-durable-switch, ArrowDown/Up between rows) and the loading / degraded
// / error states are NOT exercised here: they need either a transport stub (the
// fakes this codebase is burning down) or a multi-worktree fixture the live
// engine serves. The switch/reset invariant (022) is owned by the stores-layer
// activation path (`activateWorktreeScope` -> `switchActiveScope` -> `setScope`)
// and pure-tested; degradation selection is pure-tested via the stores selectors.
// See FINDINGS R2 (multi-worktree fixture) to restore the multi-scope render tests.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import {
  resetWorktreePickerChrome,
  setWorktreePickerExpanded,
} from "../../stores/view/worktreePickerChrome";
import { liveScope } from "../../testing/liveClient";
import { WorktreePicker } from "./WorktreePicker";
import { ENGINE_WAIT } from "../../testing/timing";

function renderPicker(props: { defaultExpanded?: boolean } = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <WorktreePicker {...props} />
    </QueryClientProvider>,
  );
}

describe("WorktreePicker loaded disclosure + a11y (S30, live engine)", () => {
  let scope: string;
  beforeAll(async () => {
    scope = await liveScope();
  });
  beforeEach(() => {
    resetWorktreePickerChrome();
    useViewStore.getState().setScope(scope);
  });
  afterEach(() => {
    cleanup();
    resetWorktreePickerChrome();
    queryClient.clear();
    useViewStore.getState().setScope(null);
  });

  it("shows the active worktree as the trigger headline with an expandable list", async () => {
    renderPicker();
    const trigger = await screen.findByRole(
      "button",
      { name: /current location/i },
      ENGINE_WAIT,
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("list", { name: /projects and worktrees/i })).toBeTruthy();
  });

  it("conveys the active scope by a non-color cue: aria-current plus weight", async () => {
    renderPicker({ defaultExpanded: true });
    await screen.findByRole("list", { name: /projects and worktrees/i }, ENGINE_WAIT);
    const activeRow = await waitFor(() => {
      const row = screen
        .getAllByRole("button")
        .find((b) => b.getAttribute("aria-current") === "true");
      expect(row).toBeTruthy();
      return row!;
    }, ENGINE_WAIT);
    // The active cue is structural (aria-current) AND grayscale-safe (weight),
    // never hue alone.
    expect(activeRow.className).toMatch(/font-medium/);
  });

  it("opens the disclosure from the keyboard (Enter on the trigger)", async () => {
    renderPicker();
    const trigger = await screen.findByRole(
      "button",
      { name: /current location/i },
      ENGINE_WAIT,
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("list", { name: /projects and worktrees/i })).toBeTruthy();
  });

  it("does not collapse store-owned disclosure state on a default runtime mount", async () => {
    setWorktreePickerExpanded(true, false);
    renderPicker();

    const trigger = await screen.findByRole(
      "button",
      { name: /current location/i },
      ENGINE_WAIT,
    );

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("list", { name: /projects and worktrees/i })).toBeTruthy();
  });

  it("never hides the control while the map is loading (always pickable)", () => {
    // First synchronous frame before the live /map query resolves. The picker MUST
    // NOT early-return a skeleton/error that hides the whole control — the trigger
    // (and thus the dropdown's project switcher + Add a project) must always be
    // reachable so the operator can always pick/add a project, even when the active
    // project's worktrees are unavailable (the never-strand invariant).
    queryClient.clear();
    renderPicker();
    expect(
      screen.getByRole("button", {
        name: /current location|choose a project or worktree/i,
      }),
    ).toBeTruthy();
  });

  it("retires the dead folder-add header button (relocated into the dropdown)", async () => {
    renderPicker();
    await screen.findByRole("button", { name: /current location/i }, ENGINE_WAIT);
    // The old no-op "open or add a project" header IconButton is gone; the
    // rail-collapse toggle remains.
    expect(screen.queryByRole("button", { name: /open or add a project/i })).toBeNull();
    expect(screen.getByRole("button", { name: /collapse left rail/i })).toBeTruthy();
  });

  it("pins an 'Add a project…' row as the first item of the dropdown", async () => {
    renderPicker({ defaultExpanded: true });
    const list = await screen.findByRole(
      "list",
      { name: /projects and worktrees/i },
      ENGINE_WAIT,
    );
    const addRow = list.querySelector("[data-worktree-add-project]");
    expect(addRow).toBeTruthy();
    expect(addRow?.textContent).toMatch(/add a project/i);
    // It is the FIRST focusable row in the list (the relocated folder-add affordance).
    expect(list.querySelector("button")).toBe(addRow);
  });

  it("hides the Projects section when a single project is registered", async () => {
    renderPicker({ defaultExpanded: true });
    await screen.findByRole("list", { name: /projects and worktrees/i }, ENGINE_WAIT);
    // The fixture registers one workspace root, so the multi-project chooser is absent.
    expect(screen.queryByText("Projects")).toBeNull();
  });

  it("collapses with Escape, returning focus to the trigger", async () => {
    renderPicker({ defaultExpanded: true });
    const trigger = await screen.findByRole(
      "button",
      { name: /current location/i },
      ENGINE_WAIT,
    );
    const firstRow = (
      await screen.findByRole("list", { name: /projects and worktrees/i }, ENGINE_WAIT)
    ).querySelector("button") as HTMLButtonElement;
    firstRow.focus();
    fireEvent.keyDown(firstRow, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });
});
