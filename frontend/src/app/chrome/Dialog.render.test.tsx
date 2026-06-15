// @vitest-environment happy-dom
//
// The reusable Dialog primitive (dashboard-settings W03.P06), rendered as real
// DOM. Exercises its own contract: it mounts only when open, exposes the dialog
// role with an accessible name + description, dismisses on Escape / backdrop /
// the close button, traps Tab focus within the panel, and moves focus inside on
// open. Uses core vitest matchers only (no jest-dom in this project).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Dialog } from "./Dialog";

afterEach(cleanup);

function renderDialog(open = true, onClose = vi.fn()) {
  const utils = render(
    <Dialog
      open={open}
      onClose={onClose}
      title="Settings"
      description="Tune the dashboard"
    >
      <button type="button">first</button>
      <button type="button">second</button>
    </Dialog>,
  );
  return { ...utils, onClose };
}

describe("Dialog", () => {
  it("renders nothing when closed", () => {
    renderDialog(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("exposes the dialog role with an accessible name and description", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    // The title heading is the accessible name (via aria-labelledby).
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(screen.getByText("Tune the dashboard")).toBeTruthy();
  });

  it("closes on Escape", () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a backdrop click but not on a panel click", () => {
    const { onClose } = renderDialog();
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    const scrim = screen.getByRole("dialog").parentElement as HTMLElement;
    fireEvent.mouseDown(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via the close button", () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the dialog on open", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("traps Tab focus within the panel (wraps last -> first)", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>("button, input, [tabindex]"),
    ).filter((el) => el.getAttribute("tabindex") !== "-1");
    const last = focusables[focusables.length - 1];
    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(focusables[0]);
  });
});
