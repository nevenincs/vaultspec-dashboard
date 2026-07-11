// @vitest-environment happy-dom
//
// Render tests for the editor formatting toolbar (document-editor-redesign
// P04.S06/S07): it exposes each formatting verb as an accessible IconButton that
// dispatches the matching command, and it is one roving FocusZone tab stop.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorToolbar } from "./EditorToolbar";

afterEach(cleanup);

describe("EditorToolbar", () => {
  it("dispatches the matching command when a button is pressed", () => {
    const onCommand = vi.fn();
    render(<EditorToolbar onCommand={onCommand} />);

    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    fireEvent.click(screen.getByRole("button", { name: "Link to document" }));

    expect(onCommand).toHaveBeenNthCalledWith(1, "bold");
    expect(onCommand).toHaveBeenNthCalledWith(2, "wikiLink");
  });

  it("is a single toolbar landmark with exactly one tab stop", () => {
    render(<EditorToolbar onCommand={() => undefined} />);
    const toolbar = screen.getByRole("toolbar", { name: "Formatting" });
    const buttons = Array.from(toolbar.querySelectorAll("button"));
    const tabbable = buttons.filter((b) => b.tabIndex === 0);
    expect(buttons.length).toBeGreaterThan(0);
    expect(tabbable.length).toBe(1);
  });

  it("disables every control when disabled", () => {
    render(<EditorToolbar onCommand={() => undefined} disabled />);
    const toolbar = screen.getByRole("toolbar", { name: "Formatting" });
    for (const button of toolbar.querySelectorAll("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
