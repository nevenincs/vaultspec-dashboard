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

  // The pinned footer slot (create-panel-hardening P01.S01): a dialog's action
  // row rendered through `footer` sits OUTSIDE the scrolling body as its
  // sibling, so it can never scroll out of reach on a constrained viewport
  // (the audit's compact-submit-behind-keyboard HIGH), and it carries the
  // safe-area bottom inset.
  it("pins the footer outside the scrolling body with the safe-area inset", () => {
    render(
      <Dialog
        open
        onClose={vi.fn()}
        title="Settings"
        footer={<button type="button">Save</button>}
      >
        <p>body copy</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    const scroller = dialog.querySelector(".overflow-y-auto") as HTMLElement;
    const save = screen.getByRole("button", { name: "Save" });
    expect(scroller).toBeTruthy();
    // The footer is NOT inside the scroll container...
    expect(scroller.contains(save)).toBe(false);
    // ...but IS inside the panel, after the scroller.
    expect(dialog.contains(save)).toBe(true);
    const footerRegion = save.parentElement as HTMLElement;
    expect(footerRegion.className).toContain("shrink-0");
    expect(footerRegion.className).toContain("safe-area-inset-bottom");
    // The body remains the one scrolling region.
    expect(dialog.querySelectorAll(".overflow-y-auto").length).toBe(1);
  });

  // The size variant (rag-job-dashboard P03.S08): `default` keeps the 34rem
  // settings width; `wide` widens to 52rem for the dashboard cockpit — both
  // retain the compact viewport guard so a wide panel still fits a narrow
  // screen. Pure width mapping, no other structural change.
  it("uses the default 34rem width when no size is given", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("w-[34rem]");
    expect(dialog.className).not.toContain("w-[52rem]");
    expect(dialog.className).toContain("max-w-[calc(100vw-2rem)]");
  });

  it('widens to 52rem under size="wide" while keeping the compact guard', () => {
    render(
      <Dialog open onClose={vi.fn()} title="Search service" size="wide">
        <p>dashboard body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("w-[52rem]");
    expect(dialog.className).not.toContain("w-[34rem]");
    expect(dialog.className).toContain("max-w-[calc(100vw-2rem)]");
  });

  it("renders no footer region when the footer prop is omitted", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    expect(
      Array.from(dialog.children).some((el) =>
        el.className.includes("safe-area-inset-bottom"),
      ),
    ).toBe(false);
  });

  // Reduced-motion honesty (audit reduced-motion-unguarded): both animated
  // layers carry the motion-reduce gate so the open animation is suppressed
  // under prefers-reduced-motion.
  it("gates the open animations on prefers-reduced-motion", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    const scrim = dialog.parentElement as HTMLElement;
    expect(dialog.className).toContain("motion-reduce:animate-none");
    expect(scrim.className).toContain("motion-reduce:animate-none");
  });
});
