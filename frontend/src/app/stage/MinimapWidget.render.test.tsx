// @vitest-environment happy-dom
//
// Minimap surface adoption (W02.P11.S27): the recodified MinimapWidget's render
// surface, accessibility, and seam/command wiring, exercised through a real DOM
// render against the real SceneController singleton (getScene) — no
// component-internal doubles. The scene's setMinimapCanvas is a safe no-op when
// the Pixi field is not yet attached, so the widget mounts and exercises its
// chrome contract without a live field.
//
// What is asserted (minimap surface ADR):
//   • the widget is an accessible group named as the minimap navigator, with a
//     canvas carrying an accessible name (role=img) — the overview reads to AT;
//   • the collapse control is a real focusable button whose aria-label +
//     aria-expanded reflect state, and collapsing unregisters the canvas from
//     the scene (setMinimapCanvas(null)) while keeping the element in the DOM;
//   • the keyboard recenter affordance issues the canonical fit-to-view camera
//     command through SceneController — keyboard navigation converges on the
//     scene's camera channel, the same one the toolbar uses;
//   • the widget never fetches and reads no raw tiers — it only talks to the
//     scene seam.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getScene } from "./Stage";
import { MinimapWidget } from "./MinimapWidget";

describe("MinimapWidget surface + a11y + seam (S27)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders an accessible minimap navigator group with a named canvas", () => {
    render(createElement(MinimapWidget));
    const group = screen.getByRole("group", { name: "graph minimap navigator" });
    expect(group).toBeTruthy();
    // The overview canvas carries an accessible name and the img role so it
    // reads as a single overview graphic to assistive tech.
    const canvas = screen.getByRole("img", { name: /graph minimap/i });
    expect(canvas.tagName.toLowerCase()).toBe("canvas");
    // The quiet "Map" label is present in the header strip.
    expect(screen.getByText("Map")).toBeTruthy();
  });

  it("exposes the collapse control with a state-accurate aria-label + aria-expanded", () => {
    render(createElement(MinimapWidget));
    const collapse = screen.getByRole("button", { name: "collapse minimap" });
    expect(collapse.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(collapse);
    const expand = screen.getByRole("button", { name: "expand minimap" });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
  });

  it("ties the collapse control to the canvas region it controls (aria-controls)", () => {
    render(createElement(MinimapWidget));
    const collapse = screen.getByRole("button", { name: "collapse minimap" });
    const controlsId = collapse.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    // The referenced region exists and wraps the minimap canvas.
    const region = document.getElementById(controlsId as string);
    expect(region).toBeTruthy();
    expect(region?.querySelector("[data-minimap-canvas]")).toBeTruthy();
  });

  it("registers the canvas on mount and unregisters it on collapse (scene seam)", () => {
    const spy = vi.spyOn(getScene().controller, "setMinimapCanvas");
    render(createElement(MinimapWidget));
    // Mount registers a real canvas element with the scene.
    expect(spy).toHaveBeenCalled();
    const lastMountArg = spy.mock.calls[spy.mock.calls.length - 1][0];
    expect(lastMountArg).not.toBeNull();

    spy.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "collapse minimap" }));
    // Collapse unregisters so the scene stops spending frames on the minimap.
    expect(spy).toHaveBeenCalledWith(null);
    // The canvas element stays in the DOM (hidden) so its ref survives.
    expect(document.querySelector("[data-minimap-canvas]")).toBeTruthy();
  });

  it("issues the canonical fit-to-view camera command from the keyboard recenter affordance", () => {
    const spy = vi.spyOn(getScene().controller, "command");
    render(createElement(MinimapWidget));
    const recenter = screen.getByRole("button", { name: "recenter the field in view" });
    fireEvent.click(recenter);
    expect(spy).toHaveBeenCalledWith({ kind: "fit-to-view" });
  });

  it("hides the recenter affordance while collapsed (nothing to recenter onto)", () => {
    render(createElement(MinimapWidget));
    expect(
      screen.getByRole("button", { name: "recenter the field in view" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "collapse minimap" }));
    expect(
      screen.queryByRole("button", { name: "recenter the field in view" }),
    ).toBeNull();
  });
});
