// @vitest-environment happy-dom
//
// Interactive palette tests (finding 032; command-palette ADR W02.P07.S23):
// the palette duplicates the arm-to-confirm and time-travel-gate semantics and
// now carries the full a11y / keyboard contract the ADR pins. These tests cover
// the palette's own copy of the safety semantics plus the keyboard navigation,
// focus management, ARIA wiring, the honest states, and the live region.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appConfirmGuard } from "../../platform/dispatch/middleware";
import { engineClient } from "../../stores/server/engine";
import { MockEngine } from "../../testing/mockEngine";
import { useViewStore } from "../../stores/view/viewStore";
import { CommandPalette } from "./CommandPalette";

function mountPalette() {
  const mock = new MockEngine();
  const opsCalls: string[] = [];
  engineClient.useTransport((input, init) => {
    if (String(input).includes("/ops/")) opsCalls.push(String(input));
    return mock.fetchImpl(input, init);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(createElement(QueryClientProvider, { client }, createElement(CommandPalette)));
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  return { opsCalls };
}

describe("CommandPalette safety semantics (032)", () => {
  beforeEach(() => {
    useViewStore.getState().setTimelineMode({ kind: "live" });
  });
  afterEach(() => {
    cleanup();
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("arms ops verbs on first activation and fires only on confirm", async () => {
    const { opsCalls } = mountPalette();
    const verb = await screen.findByText("ops: vault check");
    fireEvent.click(verb);
    expect(opsCalls).toHaveLength(0); // armed, not fired
    const armed = await screen.findByText("confirm ops: vault check?");
    fireEvent.click(armed);
    expect(opsCalls).toHaveLength(1);
    expect(opsCalls[0]).toContain("/ops/core/vault-check");
  });

  it("hides ops verbs entirely in time-travel mode (G4.b)", async () => {
    useViewStore.getState().setTimelineMode({ kind: "time-travel", at: 1 });
    mountPalette();
    const input = await screen.findByPlaceholderText(/type a command/);
    fireEvent.change(input, { target: { value: "ops" } });
    expect(screen.queryByText(/^ops:/)).toBeNull();
  });
});

describe("CommandPalette a11y + keyboard contract (W02.P07.S23)", () => {
  beforeEach(() => {
    useViewStore.getState().setTimelineMode({ kind: "live" });
  });
  afterEach(() => {
    cleanup();
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("Ctrl/Cmd-K opens then closes (toggle); Escape closes", async () => {
    mountPalette(); // opens
    expect(await screen.findByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true }); // toggle closed
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(window, { key: "k", metaKey: true }); // reopen via meta
    const input = await screen.findByPlaceholderText(/type a command/);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is a labelled modal dialog wiring combobox to listbox", async () => {
    mountPalette();
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("command palette");
    const input = screen.getByRole("combobox");
    const listbox = screen.getByRole("listbox");
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
    expect(input.getAttribute("aria-expanded")).toBe("true");
  });

  it("moves focus to the input on open and restores it on close", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "opener";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const mock = new MockEngine();
    engineClient.useTransport((input, init) => mock.fetchImpl(input, init));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      createElement(QueryClientProvider, { client }, createElement(CommandPalette)),
    );
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    const input = await screen.findByPlaceholderText(/type a command/);
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("ArrowDown/ArrowUp walk the list and reflect through aria-activedescendant", async () => {
    mountPalette();
    const input = (await screen.findByRole("combobox")) as HTMLInputElement;
    // Narrow to a stable, deterministic result set (the two core ops rows) so
    // the async vocabulary load cannot shift cursor 0 under the assertions.
    fireEvent.change(input, { target: { value: "ops vault" } });
    await screen.findByText("ops: vault check");
    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThanOrEqual(2);

    const selectedId = () =>
      screen
        .getAllByRole("option")
        .find((o) => o.getAttribute("aria-selected") === "true")?.id;
    const firstActive = input.getAttribute("aria-activedescendant");
    expect(firstActive).toBe(options[0].id);
    expect(selectedId()).toBe(firstActive);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    const secondActive = input.getAttribute("aria-activedescendant");
    expect(secondActive).toBe(options[1].id);
    expect(selectedId()).toBe(secondActive);

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBe(firstActive);
  });

  it("activating a non-confirm row (lens) closes the palette", async () => {
    mountPalette();
    // Builtin lenses render synchronously (no query) — a non-destructive row.
    const lensOption = await screen.findByText("lens: broken links");
    fireEvent.click(lensOption); // no confirm — closes immediately
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the honest no-match state without an error surface", async () => {
    mountPalette();
    const input = await screen.findByRole("combobox");
    await screen.findByText("ops: vault check"); // list populated
    fireEvent.change(input, { target: { value: "zzzznotacommand" } });
    // No SEARCH result matches; the quiet no-match row is shown. The only
    // remaining option is the contextual "save current filters as lens"
    // action (which always reflects the typed query), so the no-match
    // affordance coexists with it — never a dead or error-looking surface.
    const listbox = screen.getByRole("listbox");
    await waitFor(() => {
      expect(within(listbox).getByText("nothing matches")).toBeTruthy();
    });
    const options = screen.queryAllByRole("option");
    expect(options.every((o) => o.id.includes("save-lens"))).toBe(true);
    // No-match is a quiet row, not an error/alert surface.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("groups commands by family with visible group headings", async () => {
    mountPalette();
    // Ops families are present without any async query; await one ops row.
    await screen.findByText("ops: vault check");
    expect(screen.getByText("core ops")).toBeTruthy();
    expect(screen.getByText("rag ops")).toBeTruthy();
    // The navigate family heading appears once the scope vocabulary resolves.
    await screen.findAllByText(/^go to /);
    expect(screen.getByText("navigate")).toBeTruthy();
  });

  it("Tab wraps within the dialog (the trap actually cycles)", async () => {
    mountPalette();
    const input = (await screen.findByRole("combobox")) as HTMLInputElement;
    const dialog = screen.getByRole("dialog");
    // Inject a SECOND real tab stop into the panel so the wrap-around branch is
    // genuinely exercised — with only the input focusable the assertion would
    // pass even if the trap handler were deleted (the near-tautology the review
    // flagged). With two stops, Tab from the last must wrap to the first and
    // Shift+Tab from the first must wrap to the last, and the handler must call
    // preventDefault to suppress the native tab.
    const second = document.createElement("button");
    second.textContent = "second stop";
    dialog.appendChild(second);

    // Forward Tab from the LAST focusable (the injected button) wraps to first.
    second.focus();
    const fwd = fireEvent.keyDown(dialog, { key: "Tab" });
    expect(fwd).toBe(false); // default was prevented
    expect(document.activeElement).toBe(input);

    // Shift+Tab from the FIRST focusable (the input) wraps to the last.
    input.focus();
    const back = fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(back).toBe(false); // default was prevented
    expect(document.activeElement).toBe(second);

    second.remove();
  });

  it("surfaces the ops result inline without closing the palette", async () => {
    const { opsCalls } = mountPalette();
    const verb = await screen.findByText("ops: vault check");
    fireEvent.click(verb); // arm
    const armed = await screen.findByText("confirm ops: vault check?");
    fireEvent.click(armed); // fire
    expect(opsCalls).toHaveLength(1);
    // The palette stays open and shows a legible status line.
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(await screen.findByRole("status")).toBeTruthy();
  });
});

describe("CommandPalette disarm hygiene (M1/M2 revisions)", () => {
  beforeEach(() => {
    useViewStore.getState().setTimelineMode({ kind: "live" });
    appConfirmGuard.reset();
  });
  afterEach(() => {
    cleanup();
    appConfirmGuard.reset();
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("backdrop dismiss disarms a pending ops verb (no leak into the guard)", async () => {
    const { opsCalls } = mountPalette();
    const verb = await screen.findByText("ops: vault check");
    fireEvent.click(verb); // arm
    await screen.findByText("confirm ops: vault check?");
    expect(appConfirmGuard.isArmed("ops:run")).toBe(true);

    // Click the scrim (the fixed overlay is the input's offsetParent root).
    const scrim = screen.getByRole("dialog").parentElement as HTMLElement;
    fireEvent.mouseDown(scrim);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(appConfirmGuard.isArmed("ops:run")).toBe(false);
    expect(opsCalls).toHaveLength(0); // never fired
  });

  it("activating a non-confirm row while armed disarms before running", async () => {
    const { opsCalls } = mountPalette();
    const verb = await screen.findByText("ops: vault check");
    fireEvent.click(verb); // arm an ops verb
    expect(appConfirmGuard.isArmed("ops:run")).toBe(true);

    // Click a non-confirm row (a builtin lens) — it must disarm, then close.
    const lens = await screen.findByText("lens: broken links");
    fireEvent.click(lens);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(appConfirmGuard.isArmed("ops:run")).toBe(false);
    expect(opsCalls).toHaveLength(0); // the armed verb never fired
  });

  it("hovering another row (pointer) disarms the pending confirm", async () => {
    mountPalette();
    const verb = await screen.findByText("ops: vault check");
    fireEvent.click(verb); // arm
    expect(appConfirmGuard.isArmed("ops:run")).toBe(true);
    // The armed prompt is showing on the armed row.
    expect(screen.getByText("confirm ops: vault check?")).toBeTruthy();

    // Mouse-enter a different row: the cursor moves AND the arm clears, so the
    // armed-row id can never desync from the visually-selected row.
    const other = screen.getByText("ops: vault stats");
    fireEvent.mouseEnter(other.closest('[role="option"]') as HTMLElement);
    expect(appConfirmGuard.isArmed("ops:run")).toBe(false);
    expect(screen.queryByText("confirm ops: vault check?")).toBeNull();
  });

  it("Ctrl/Cmd-K toggle-close disarms a pending ops verb", async () => {
    mountPalette();
    const verb = await screen.findByText("ops: vault check");
    fireEvent.click(verb); // arm
    expect(appConfirmGuard.isArmed("ops:run")).toBe(true);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true }); // toggle closed
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(appConfirmGuard.isArmed("ops:run")).toBe(false);
  });
});
