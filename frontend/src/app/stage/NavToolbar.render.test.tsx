// @vitest-environment happy-dom
//
// Nav-controls surface adoption (W02.P06.S22): the camera + LOD rail's
// behaviour, keyboard contract, and disabled / degraded states, exercised
// through the real stores client transport (mockEngine) — no component-internal
// doubles. The granularity descent's degraded affordance is driven by a real
// tiers block the mock serves (and read through the stores selector, never the
// raw tiers block), proving the surface renders degradation as a designed state.
//
// What is asserted (nav-controls ADR):
//   • ARIA toolbar landmark + accessible control labels (camera, granularity,
//     fullscreen) and aria-pressed on the toggles;
//   • the semantic-level receipt reflects the camera-change event and spells the
//     level in full in its accessible name;
//   • the roving-tabstop arrow walk (ArrowRight/ArrowLeft/Home/End) moves focus
//     between enabled controls and clamps at the ends (handoff to page Tab);
//   • time-travel disables the granularity descent (the driver owns the scene)
//     while the camera controls stay live;
//   • a degraded graph slice paints a quiet designed affordance on the descent,
//     not an error, with the engine's reason in copy tone.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { MockEngine, MOCK_SCOPE } from "../../testing/mockEngine";
import { getScene } from "./Stage";
import { NavToolbar } from "./NavToolbar";

function renderToolbar() {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(NavToolbar, {
        algorithmPanelOpen: false,
        onAlgorithmPanelToggle: () => {},
      }),
    ),
  );
}

/** The rail's roving members, in DOM order — the controls the arrow walk steps
 *  through (disabled controls drop out, matching the component's selector). */
function roveMembers(): HTMLButtonElement[] {
  const toolbar = screen.getByRole("toolbar", { name: "graph navigation" });
  return Array.from(
    toolbar.querySelectorAll<HTMLButtonElement>("button[data-nav-rove]:not(:disabled)"),
  );
}

describe("NavToolbar surface + a11y + states (S22)", () => {
  beforeEach(() => {
    // Pin the active scope synchronously so useActiveScope resolves without the
    // map/session round-trip; the graph-slice query then runs against the mock.
    useViewStore.getState().setScope(MOCK_SCOPE);
    engineClient.useTransport(new MockEngine().fetchImpl);
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
    useViewStore.getState().setTimelineMode({ kind: "live" });
    useViewStore.getState().setGranularity("feature");
    engineClient.useTransport((input, init) => fetch(input, init));
    vi.restoreAllMocks();
  });

  it("renders an ARIA toolbar with accessible control labels and pressed toggles", () => {
    renderToolbar();
    const toolbar = screen.getByRole("toolbar", { name: "graph navigation" });
    expect(toolbar.getAttribute("aria-orientation")).toBe("horizontal");
    // Camera commands are real, labelled buttons.
    for (const name of ["zoom out", "zoom in", "fit to view", "reset view"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    // The granularity segments expose pressed state; "feature" is the default.
    const feat = screen.getByRole("button", { name: "feat" });
    const docs = screen.getByRole("button", { name: "docs" });
    expect(feat.getAttribute("aria-pressed")).toBe("true");
    expect(docs.getAttribute("aria-pressed")).toBe("false");
    // Fullscreen is a labelled toggle.
    expect(screen.getByRole("button", { name: "fullscreen" })).toBeTruthy();
  });

  it("emits the camera SceneCommand on click (chrome → seam, never the renderer)", () => {
    const spy = vi.spyOn(getScene().controller, "command");
    renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "reset view" }));
    expect(spy).toHaveBeenCalledWith({ kind: "zoom-in" });
    expect(spy).toHaveBeenCalledWith({ kind: "reset-view" });
  });

  it("reflects the camera-change event in the level receipt, spelling it in full", async () => {
    renderToolbar();
    // The level label is absent until the first camera-change arrives.
    expect(document.querySelector("[data-nav-level]")).toBeNull();
    getScene().controller.emit({
      kind: "camera-change",
      scale: 0.3,
      level: "constellation",
    });
    await waitFor(() => {
      const receipt = document.querySelector("[data-nav-level]");
      expect(receipt?.textContent).toBe("all");
      // Accessible name spells the level in full (ADR: not the compact token).
      expect(receipt?.getAttribute("aria-label")).toBe("zoom level: constellation");
    });
    getScene().controller.emit({ kind: "camera-change", scale: 2, level: "document" });
    await waitFor(() => {
      expect(document.querySelector("[data-nav-level]")?.textContent).toBe("doc");
    });
  });

  it("walks focus across enabled controls with arrow keys and clamps at the ends", () => {
    renderToolbar();
    const members = roveMembers();
    expect(members.length).toBeGreaterThan(2);
    members[0].focus();
    expect(document.activeElement).toBe(members[0]);
    // ArrowLeft at the first control clamps (handoff to page Tab — no wrap).
    fireEvent.keyDown(members[0], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(members[0]);
    // ArrowRight steps forward.
    fireEvent.keyDown(members[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(members[1]);
    // End jumps to the last control; ArrowRight there clamps.
    fireEvent.keyDown(members[1], { key: "End" });
    expect(document.activeElement).toBe(members[members.length - 1]);
    fireEvent.keyDown(members[members.length - 1], { key: "ArrowRight" });
    expect(document.activeElement).toBe(members[members.length - 1]);
    // Home jumps back to the first.
    fireEvent.keyDown(members[members.length - 1], { key: "Home" });
    expect(document.activeElement).toBe(members[0]);
  });

  it("is a single Tab-stop: exactly one roving control carries tabIndex 0", () => {
    renderToolbar();
    const toolbar = screen.getByRole("toolbar", { name: "graph navigation" });
    const entryStops = Array.from(
      toolbar.querySelectorAll<HTMLButtonElement>("button[data-nav-rove]"),
    ).filter((b) => b.tabIndex === 0);
    expect(entryStops).toHaveLength(1);
  });

  it("disables the granularity descent in time-travel, keeping the camera live", () => {
    useViewStore.getState().setTimelineMode({ kind: "time-travel", at: 123 });
    renderToolbar();
    const feat = screen.getByRole("button", { name: "feat" });
    const docs = screen.getByRole("button", { name: "docs" });
    expect(feat).toHaveProperty("disabled", true);
    expect(docs).toHaveProperty("disabled", true);
    const group = document.querySelector("[data-nav-granularity]");
    expect(group?.getAttribute("aria-disabled")).toBe("true");
    expect(group?.getAttribute("title")).toMatch(/while time travelling/i);
    // Camera navigation stays live — pure view concern, not owned by the driver.
    expect(screen.getByRole("button", { name: "zoom in" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(screen.getByRole("button", { name: "reset view" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("excludes the disabled descent segments from the arrow walk in time-travel", () => {
    useViewStore.getState().setTimelineMode({ kind: "time-travel", at: 123 });
    renderToolbar();
    const members = roveMembers();
    // No disabled granularity segment is a roving target.
    expect(
      members.every((b) => b.textContent !== "feat" && b.textContent !== "docs"),
    ).toBe(true);
  });

  it("paints a quiet designed degraded affordance on the descent, with the engine reason", async () => {
    const mock = new MockEngine();
    mock.degrade("semantic", "rag service down");
    engineClient.useTransport(mock.fetchImpl);
    renderToolbar();
    await waitFor(() => {
      const group = document.querySelector("[data-nav-granularity]");
      expect(group?.getAttribute("title")).toMatch(/rag service down/);
    });
    // Degradation is NOT an error: the rail and its controls still render.
    expect(screen.getByRole("toolbar", { name: "graph navigation" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "feat" })).toBeTruthy();
  });

  it("writes the granularity setter on segment click (stores write, not a fetch)", () => {
    renderToolbar();
    expect(useViewStore.getState().granularity).toBe("feature");
    fireEvent.click(screen.getByRole("button", { name: "docs" }));
    expect(useViewStore.getState().granularity).toBe("document");
    fireEvent.click(screen.getByRole("button", { name: "feat" }));
    expect(useViewStore.getState().granularity).toBe("feature");
  });
});
