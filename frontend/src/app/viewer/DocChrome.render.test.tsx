// @vitest-environment happy-dom
//
// Reading-mode accelerator hints on the doc chrome (authoring-surface ADR D3, S21):
// the View/Edit toggle carries the view/edit-toggle chord (Mod+E) and the
// close-editor chord (Mod+Alt+W) as Kbd chips, DERIVED from the keymap catalog rather
// than hand-typed. Pinned to non-macOS so `Mod` renders as the literal "Ctrl" keycap.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setIsMacForTesting } from "../../platform/keymap/chord";
import { DocChrome } from "./DocChrome";

beforeEach(() => setIsMacForTesting(false));
afterEach(() => {
  setIsMacForTesting(null);
  cleanup();
});

function renderChrome() {
  return render(
    <DocChrome
      trail={[{ label: "doc" }]}
      mode="view"
      onModeChange={() => undefined}
      canEdit
    />,
  );
}

describe("DocChrome accelerator hints", () => {
  it("renders the toggle and close chords as derived Kbd chips", () => {
    renderChrome();
    const hints = document.querySelector("[data-doc-chrome-accelerators]");
    expect(hints).toBeTruthy();
    const caps = Array.from(hints!.querySelectorAll("kbd")).map((k) => k.textContent);
    // Toggle = Ctrl+E, Close = Ctrl+Alt+W on non-mac — never a hand-typed string.
    expect(caps).toEqual(["Ctrl", "E", "Ctrl", "Alt", "W"]);
    expect(hints!.textContent).toContain("Toggle");
    expect(hints!.textContent).toContain("Close");
  });

  it("mirrors the toggle chord onto the segments' native tooltips", () => {
    renderChrome();
    expect(screen.getByRole("radio", { name: "View" }).getAttribute("title")).toBe(
      "Toggle edit mode (Ctrl E)",
    );
  });
});
