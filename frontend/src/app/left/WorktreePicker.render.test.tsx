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
// engine serves. The switch/reset invariant (022) is owned by setScope and pure-
// tested; degradation selection is pure-tested via the stores selectors. See
// FINDINGS R2 (multi-worktree fixture) to restore the multi-scope render tests.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { liveScope } from "../../testing/liveClient";
import { WorktreePicker } from "./WorktreePicker";

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
    useViewStore.getState().setScope(scope);
  });
  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
  });

  it("shows the active worktree as the trigger headline with an expandable list", async () => {
    renderPicker();
    const trigger = await screen.findByRole("button", { name: /worktree scope/i });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("list", { name: /worktree scopes/i })).toBeTruthy();
  });

  it("conveys the active scope by a non-color cue: aria-current plus weight", async () => {
    renderPicker({ defaultExpanded: true });
    await screen.findByRole("list", { name: /worktree scopes/i });
    const activeRow = await waitFor(() => {
      const row = screen
        .getAllByRole("button")
        .find((b) => b.getAttribute("aria-current") === "true");
      expect(row).toBeTruthy();
      return row!;
    });
    // The active cue is structural (aria-current) AND grayscale-safe (weight),
    // never hue alone.
    expect(activeRow.className).toMatch(/font-medium/);
  });

  it("opens the disclosure from the keyboard (Enter on the trigger)", async () => {
    renderPicker();
    const trigger = await screen.findByRole("button", { name: /worktree scope/i });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("list", { name: /worktree scopes/i })).toBeTruthy();
  });

  it("collapses with Escape, returning focus to the trigger", async () => {
    renderPicker({ defaultExpanded: true });
    const trigger = await screen.findByRole("button", { name: /worktree scope/i });
    const firstRow = (
      await screen.findByRole("list", { name: /worktree scopes/i })
    ).querySelector("button") as HTMLButtonElement;
    firstRow.focus();
    fireEvent.keyDown(firstRow, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });
});
