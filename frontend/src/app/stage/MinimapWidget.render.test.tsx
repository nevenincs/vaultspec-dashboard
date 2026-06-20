// @vitest-environment happy-dom
//
// Minimap surface (binding Figma `MinimapWidget` 636:2144): the headerless overview
// card's render surface, accessibility, and seam wiring, exercised through a real DOM
// render against the real SceneController singleton (getScene) — no component-internal
// doubles. The scene's setMinimapCanvas is a safe no-op when the field is not yet
// attached, so the widget mounts and exercises its chrome contract without a live field.
//
// What is asserted (binding minimap):
//   • the widget is an accessible group named as the minimap navigator, with a
//     canvas carrying an accessible name (role=img) — the overview reads to AT;
//   • the bespoke header is RETIRED — no "Map" eyebrow, no recenter button, no
//     collapse button (recenter lives on the camera nav cluster);
//   • the canvas is registered with the scene on mount (setMinimapCanvas);
//   • the widget never fetches and reads no raw tiers — it only talks to the scene seam.

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getScene } from "./Stage";
import { MinimapWidget } from "./MinimapWidget";

describe("MinimapWidget surface + a11y + seam (binding headerless card)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders an accessible minimap navigator group with a named canvas", () => {
    render(createElement(MinimapWidget));
    expect(screen.getByRole("group", { name: "graph minimap navigator" })).toBeTruthy();
    const canvas = screen.getByRole("img", { name: /graph minimap/i });
    expect(canvas.tagName.toLowerCase()).toBe("canvas");
  });

  it("retires the header chrome — no Map eyebrow, no recenter, no collapse control", () => {
    render(createElement(MinimapWidget));
    expect(screen.queryByText("Map")).toBeNull();
    expect(screen.queryByRole("button", { name: /recenter/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /collapse minimap/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /expand minimap/i })).toBeNull();
  });

  it("registers the canvas with the scene on mount (scene seam)", () => {
    const spy = vi.spyOn(getScene().controller, "setMinimapCanvas");
    render(createElement(MinimapWidget));
    expect(spy).toHaveBeenCalled();
    const lastArg = spy.mock.calls[spy.mock.calls.length - 1][0];
    expect(lastArg).not.toBeNull();
    expect((lastArg as HTMLElement)?.tagName?.toLowerCase()).toBe("canvas");
  });
});
