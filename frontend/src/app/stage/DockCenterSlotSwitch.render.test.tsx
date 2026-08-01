// @vitest-environment happy-dom
//
// The dock header's segmented {graph | agent} switch (agent-panel-shell-integration
// D1). It replaced the lone graph toggle, so what is pinned here is that it drives
// the ONE shared descriptor seam — the same verbs Cmd+K, the chords, and the
// background menu fire — and that the affordance beside it always leaves a keyboard
// path back into an emptied slot.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { getShellCenterSlot, setShellCenterSlot } from "../../stores/view/shellLayout";
import { DockCenterSlotSwitch } from "./DockWorkspace";

/** Drive the slot from OUTSIDE the switch (a chord, the palette, a footer chip) and
 *  let the subscription flush, so the rendered control is reading the live verb. */
function setSlot(slot: "graph" | "agent" | "none"): void {
  act(() => setShellCenterSlot(slot));
}

function renderSwitch() {
  const runtime = createTestLocalizationRuntime();
  return render(
    <I18nextProvider i18n={runtime}>
      <DockCenterSlotSwitch />
    </I18nextProvider>,
  );
}

beforeEach(() => setShellCenterSlot("graph"));
afterEach(() => {
  cleanup();
  setShellCenterSlot("graph");
});

describe("DockCenterSlotSwitch", () => {
  it("renders the two occupants as one exclusive radiogroup", () => {
    renderSwitch();
    const group = screen.getByRole("radiogroup", { name: "Center panel" });
    expect(group).not.toBeNull();

    const graph = screen.getByRole("radio", { name: "Graph" });
    const agent = screen.getByRole("radio", { name: "Agent" });
    expect(graph.getAttribute("aria-checked")).toBe("true");
    expect(agent.getAttribute("aria-checked")).toBe("false");
  });

  it("selects each occupant, displacing the other", () => {
    renderSwitch();
    fireEvent.click(screen.getByRole("radio", { name: "Agent" }));
    expect(getShellCenterSlot()).toBe("agent");
    expect(
      screen.getByRole("radio", { name: "Agent" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByRole("radio", { name: "Graph" }).getAttribute("aria-checked"),
    ).toBe("false");

    fireEvent.click(screen.getByRole("radio", { name: "Graph" }));
    expect(getShellCenterSlot()).toBe("graph");
  });

  it("ignores a click on the already-selected occupant", () => {
    // A radiogroup must not un-select itself into the empty slot: the segments each
    // compose a TOGGLE descriptor, so re-selecting the checked one would otherwise
    // read as "hide" and silently empty the center.
    renderSwitch();
    fireEvent.click(screen.getByRole("radio", { name: "Graph" }));
    expect(getShellCenterSlot()).toBe("graph");

    setSlot("agent");
    fireEvent.click(screen.getByRole("radio", { name: "Agent" }));
    expect(getShellCenterSlot()).toBe("agent");
  });

  it("collapses the occupant that holds the slot, naming the resulting action", () => {
    renderSwitch();
    fireEvent.click(screen.getByRole("button", { name: "Hide graph" }));
    expect(getShellCenterSlot()).toBe("none");

    setSlot("agent");
    fireEvent.click(screen.getByRole("button", { name: "Close agent panel" }));
    expect(getShellCenterSlot()).toBe("none");
  });

  it("keeps a reachable way back once the slot is empty", () => {
    // With no occupant, NEITHER segment is checked — and a roving-tabindex radiogroup
    // with nothing checked has no tab stop. The collapse affordance is therefore the
    // keyboard path back in, and must stay rendered and honestly labelled.
    setShellCenterSlot("none");
    renderSwitch();
    expect(
      screen.getByRole("radio", { name: "Graph" }).getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      screen.getByRole("radio", { name: "Agent" }).getAttribute("aria-checked"),
    ).toBe("false");

    const restore = screen.getByRole("button", { name: "Show graph" });
    fireEvent.click(restore);
    expect(getShellCenterSlot()).toBe("graph");
  });
});
