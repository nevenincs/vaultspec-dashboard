// @vitest-environment happy-dom
//
// Document chrome keeps shortcut hints out of the visible UI. The View/Edit toggle
// exposes its registry-derived chord only through its native hover tooltip. Pinned to
// non-macOS so `Mod` renders as the literal "Ctrl" keycap.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setIsMacForTesting } from "../../platform/keymap/chord";
import { DocChrome } from "./DocChrome";

beforeEach(() => setIsMacForTesting(false));
afterEach(() => {
  setIsMacForTesting(null);
  cleanup();
});

function renderChrome(mode: "view" | "edit" = "view") {
  return render(
    <DocChrome
      trail={[{ label: "doc" }]}
      mode={mode}
      onModeChange={() => undefined}
      canEdit
    />,
  );
}

describe("DocChrome accelerator hints", () => {
  it.each(["view", "edit"] as const)(
    "does not render inline shortcut hints in %s mode",
    (mode) => {
      renderChrome(mode);
      expect(document.querySelector("[data-doc-chrome-accelerators]")).toBeNull();
      expect(document.querySelector("kbd")).toBeNull();
    },
  );

  it.each(["view", "edit"] as const)(
    "keeps the registry-derived shortcut in hover tooltips in %s mode",
    (mode) => {
      renderChrome(mode);
      expect(screen.getByRole("radio", { name: "View" }).getAttribute("title")).toBe(
        "Toggle edit mode (Ctrl E)",
      );
      expect(screen.getByRole("radio", { name: "Edit" }).getAttribute("title")).toBe(
        "Toggle edit mode (Ctrl E)",
      );
    },
  );
});
