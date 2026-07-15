// @vitest-environment happy-dom
//
// Exercises the confirmation content contract:
// it composes the Dialog shell (dialog role, title), renders the message and a
// Cancel / accent-confirm button row, auto-focuses the confirm affordance, and
// routes Cancel / Escape / the close button through onCancel while the confirm
// button fires onConfirm. Core vitest matchers only (no jest-dom in this repo).

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import { ConfirmDialog } from "./ConfirmDialog";

afterEach(cleanup);

function renderConfirm(open = true, cancelLabel?: string) {
  let confirmCount = 0;
  let cancelCount = 0;
  const runtime = createTestLocalizationRuntime();
  const utils = render(
    <I18nextProvider i18n={runtime}>
      <ConfirmDialog
        open={open}
        title="Archive feature"
        message="Archiving #figma-design-bridge moves 6 documents to .archive/."
        confirmLabel="Archive"
        cancelLabel={cancelLabel}
        onConfirm={() => {
          confirmCount += 1;
        }}
        onCancel={() => {
          cancelCount += 1;
        }}
      />
    </I18nextProvider>,
  );
  return {
    ...utils,
    runtime,
    confirmCount: () => confirmCount,
    cancelCount: () => cancelCount,
  };
}

describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    renderConfirm(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the title, message, and both buttons", () => {
    renderConfirm();
    expect(screen.getByRole("heading", { name: "Archive feature" })).toBeTruthy();
    expect(screen.getByText(/Archiving #figma-design-bridge/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Archive" })).toBeTruthy();
  });

  it("fires onConfirm from the accent button", () => {
    const { confirmCount } = renderConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(confirmCount()).toBe(1);
  });

  it("routes Cancel, Escape, and the close button through onCancel", () => {
    const { cancelCount } = renderConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(cancelCount()).toBe(3);
  });

  it("updates the default cancel label for each locale without replacing the focused controls", async () => {
    const { runtime } = renderConfirm();
    const dialog = screen.getByRole("dialog");
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    const confirmButton = screen.getByRole("button", { name: "Archive" });
    await waitFor(() => expect(document.activeElement).toBe(confirmButton));

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("button", {
        name: ltrTestResources.common.actions.cancel,
      }),
    ).toBe(cancelButton);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("button", {
        name: rtlTestResources.common.actions.cancel,
      }),
    ).toBe(cancelButton);
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(screen.getByRole("button", { name: "Archive" })).toBe(confirmButton);
    expect(document.activeElement).toBe(confirmButton);
  });

  it("keeps an explicit caller label unchanged across locale changes", async () => {
    const { runtime } = renderConfirm(true, "Keep editing");
    const cancelButton = screen.getByRole("button", { name: "Keep editing" });

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(screen.getByRole("button", { name: "Keep editing" })).toBe(cancelButton);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(screen.getByRole("button", { name: "Keep editing" })).toBe(cancelButton);
  });
});
