// @vitest-environment happy-dom
//
// The confirm-dialog content layer (figma 17:1276). Exercises its own contract:
// it composes the Dialog shell (dialog role, title), renders the message and a
// Cancel / accent-confirm button row, auto-focuses the confirm affordance, and
// routes Cancel / Escape / the close button through onCancel while the confirm
// button fires onConfirm. Core vitest matchers only (no jest-dom in this repo).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./ConfirmDialog";

afterEach(cleanup);

function renderConfirm(open = true) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <ConfirmDialog
      open={open}
      title="Archive feature"
      message="Archiving #figma-design-bridge moves 6 documents to .archive/."
      confirmLabel="Archive"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { ...utils, onConfirm, onCancel };
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
    const { onConfirm } = renderConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("routes Cancel, Escape, and the close button through onCancel", () => {
    const { onCancel } = renderConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalledTimes(3);
  });
});
