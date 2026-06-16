// @vitest-environment happy-dom
//
// The keyboard-shortcuts surface (figma-frontend-rewrite W03.P09.S13). It is a
// self-contained legend: the global "?" key toggles it, it renders the real
// shortcut groups as kit ListRows with Kbd keycaps, and Escape dismisses it
// through the shared Dialog. These assert the open/close contract and that the
// legend names the contract the app actually implements.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { KeyboardShortcuts } from "./KeyboardShortcuts";

afterEach(cleanup);

describe("KeyboardShortcuts", () => {
  it("is closed until the global ? key opens it", () => {
    render(<KeyboardShortcuts />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(window, { key: "?" });
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("Keyboard shortcuts")).toBeTruthy();
  });

  it("renders the real shortcut groups with keycaps", () => {
    render(<KeyboardShortcuts />);
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByText("General")).toBeTruthy();
    expect(screen.getByText("Graph & selection")).toBeTruthy();
    expect(screen.getByText("Timeline")).toBeTruthy();
    // A known shortcut row + its keycap rendered as a <kbd> element.
    expect(screen.getByText("Open the command palette")).toBeTruthy();
    const caps = screen.getAllByText("K");
    expect(caps.some((el) => el.tagName.toLowerCase() === "kbd")).toBe(true);
  });

  it("does not open while typing ? inside a form field", () => {
    render(
      <>
        <input aria-label="query" />
        <KeyboardShortcuts />
      </>,
    );
    const input = screen.getByLabelText("query");
    input.focus();
    fireEvent.keyDown(input, { key: "?" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape dismisses the legend", () => {
    render(<KeyboardShortcuts />);
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
