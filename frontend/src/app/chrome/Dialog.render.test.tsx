// @vitest-environment happy-dom
//
// Exercises the Dialog contract in the DOM: it mounts only when open, exposes the dialog
// role with an accessible name + description, dismisses on Escape / backdrop /
// the close button, traps Tab focus within the panel, and moves focus inside on
// open. Uses core vitest matchers only (no jest-dom in this project).

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import { Dialog } from "./Dialog";

afterEach(cleanup);

function renderWithLocalization(children: ReactNode) {
  const runtime = createTestLocalizationRuntime();
  const utils = render(<I18nextProvider i18n={runtime}>{children}</I18nextProvider>);
  return { ...utils, runtime };
}

function renderDialog(open = true) {
  let closeCount = 0;
  const utils = renderWithLocalization(
    <Dialog
      open={open}
      onClose={() => {
        closeCount += 1;
      }}
      title="Settings"
      description="Tune the dashboard"
    >
      <button type="button">first</button>
      <button type="button">second</button>
    </Dialog>,
  );
  return { ...utils, closeCount: () => closeCount };
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
    const { closeCount } = renderDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeCount()).toBe(1);
  });

  it("closes on a backdrop click but not on a panel click", () => {
    const { closeCount } = renderDialog();
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(closeCount()).toBe(0);
    const scrim = screen.getByRole("dialog").parentElement as HTMLElement;
    fireEvent.mouseDown(scrim);
    expect(closeCount()).toBe(1);
  });

  it("closes via the close button", () => {
    const { closeCount } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(closeCount()).toBe(1);
  });

  it("blocks every dismiss path while dismissal is disabled", () => {
    let closeCount = 0;
    renderWithLocalization(
      <Dialog
        open
        dismissible={false}
        onClose={() => {
          closeCount += 1;
        }}
        title="Adding project"
      >
        <p>Project folder</p>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog");
    const scrim = dialog.parentElement as HTMLElement;
    const close = screen.getByRole("button", { name: "Close" }) as HTMLButtonElement;
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseDown(scrim);
    fireEvent.click(close);

    expect(close.disabled).toBe(true);
    expect(closeCount).toBe(0);
  });

  it("updates the close label for each locale without replacing or refocusing the dialog", async () => {
    const { runtime } = renderDialog();
    const dialog = screen.getByRole("dialog");
    const closeButton = screen.getByRole("button", { name: "Close" });
    const titleId = dialog.getAttribute("aria-labelledby");
    const descriptionId = dialog.getAttribute("aria-describedby");
    expect(document.activeElement).toBe(closeButton);

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("button", {
        name: ltrTestResources.common.actions.close,
      }),
    ).toBe(closeButton);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("button", {
        name: rtlTestResources.common.actions.close,
      }),
    ).toBe(closeButton);
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(dialog.getAttribute("aria-labelledby")).toBe(titleId);
    expect(dialog.getAttribute("aria-describedby")).toBe(descriptionId);
    expect(document.activeElement).toBe(closeButton);
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

  // The footer remains outside the scrolling body and visible in constrained viewports.
  it("pins the footer outside the scrolling body with the safe-area inset", () => {
    renderWithLocalization(
      <Dialog
        open
        onClose={() => undefined}
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

  // Width variants retain the compact viewport guard.
  it("uses the default 34rem width when no size is given", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("w-[34rem]");
    expect(dialog.className).not.toContain("w-[52rem]");
    expect(dialog.className).toContain("max-w-[calc(100vw-2rem)]");
  });

  it('widens to 52rem under size="wide" while keeping the compact guard', () => {
    renderWithLocalization(
      <Dialog open onClose={() => undefined} title="Search service" size="wide">
        <p>dashboard body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("w-[52rem]");
    expect(dialog.className).not.toContain("w-[34rem]");
    expect(dialog.className).toContain("max-w-[calc(100vw-2rem)]");
  });

  it('uses the 45rem picker width under size="medium"', () => {
    let closeCount = 0;
    renderWithLocalization(
      <Dialog
        open
        onClose={() => {
          closeCount += 1;
        }}
        title="Add a project"
        size="medium"
      >
        <p>Project folder</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("w-[45rem]");
    expect(dialog.className).toContain("max-w-[calc(100vw-2rem)]");
    expect(closeCount).toBe(0);
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

  // Both animated layers respect the reduced-motion preference.
  it("gates the open animations on prefers-reduced-motion", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    const scrim = dialog.parentElement as HTMLElement;
    expect(dialog.className).toContain("motion-reduce:animate-none");
    expect(scrim.className).toContain("motion-reduce:animate-none");
  });
});
