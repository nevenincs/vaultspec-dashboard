// @vitest-environment happy-dom
//
// Canvas-controls surface adoption (W02.P10.S26): the tier dial, filter bar,
// and working-set trail's behaviour, grayscale-safe tier-dial states, keyboard,
// and the working-set add/remove — exercised through the real stores client
// transport (mockEngine), with no component-internal doubles. The tier dial's
// degraded (rag-down → semantic offline) state is driven by a real tiers block
// the mock serves and read through the stores availability selector, never the
// raw tiers block, proving the control renders degradation as a designed state.
//
// What is asserted (canvas-controls ADR):
//   • the four tier toggles are real role="switch" controls in the fixed
//     product order, each carrying its bespoke domain MARK (grayscale-safe
//     identity by shape, not hue alone) plus a non-color data-state cue;
//   • the confidence-floor slider exposes an aria-label and a tabular readout;
//   • time-travel renders the semantic tier INAPPLICABLE (disabled designed
//     state) while the other three stay live;
//   • a rag-down graph slice renders the semantic tier OFFLINE (disabled
//     designed state), not an error, derived through the stores selector;
//   • the filter bar's sidebar toggle is a labelled, pressed-state control;
//   • the working-set trail hides when empty, renders a tabular size readout
//     and removable breadcrumbs, and add/remove/clear drive the view store.

import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { useFilterStore } from "../../stores/view/filters";
import { useViewStore } from "../../stores/view/viewStore";
import { MockEngine, MOCK_SCOPE } from "../../testing/mockEngine";
import { Discover } from "./Discover";
import { FilterBar } from "./FilterBar";
import { TierDial } from "./TierDial";
import { WorkingSet } from "./WorkingSet";

function renderWithClient(node: React.ReactElement) {
  return render(createElement(QueryClientProvider, { client: queryClient }, node));
}

let mock: MockEngine;

beforeEach(() => {
  mock = new MockEngine();
  // Pin the active scope synchronously so useActiveScope resolves without the
  // map/session round-trip; the vocabulary + graph-slice queries then run
  // against the mock.
  useViewStore.getState().setScope(MOCK_SCOPE);
  engineClient.useTransport(mock.fetchImpl);
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  useViewStore.getState().setScope(null);
  useViewStore.getState().setTimelineMode({ kind: "live" });
  useViewStore.getState().setGranularity("feature");
  useViewStore.getState().clearWorkingSet();
  useFilterStore.getState().reset();
  engineClient.useTransport((input, init) => fetch(input, init));
});

describe("TierDial surface + grayscale-safe states + a11y (S26)", () => {
  it("renders four role=switch tiers in product order, each with a domain mark", () => {
    renderWithClient(createElement(TierDial));
    const dial = screen.getByRole("group", { name: "tier dial" });
    const switches = within(dial).getAllByRole("switch");
    expect(switches.map((s) => s.getAttribute("aria-label"))).toEqual([
      "declared tier",
      "structural tier",
      "temporal tier",
      "semantic tier",
    ]);
    // Each toggle carries its bespoke tier mark (grayscale identity by SHAPE,
    // not hue alone): an inline svg with the tier-mark accessible name.
    for (const label of ["declared", "structural", "temporal", "semantic"]) {
      const sw = screen.getByRole("switch", { name: `${label} tier` });
      const mark = within(sw).getByRole("img", { name: `${label} tier mark` });
      expect(mark.tagName.toLowerCase()).toBe("svg");
    }
  });

  it("toggling a tier flips aria-checked AND the non-color data-state cue", () => {
    renderWithClient(createElement(TierDial));
    const declared = screen.getByRole("switch", { name: "declared tier" });
    // Default-on per DEFAULT_CHOICES.
    expect(declared.getAttribute("aria-checked")).toBe("true");
    expect(declared.getAttribute("data-state")).toBe("on");
    fireEvent.click(declared);
    expect(declared.getAttribute("aria-checked")).toBe("false");
    // The active state is carried by a non-color cue, not hue alone.
    expect(declared.getAttribute("data-state")).toBe("off");
    expect(useFilterStore.getState().tiers.declared).toBe(false);
  });

  it("exposes the temporal confidence-floor slider with a label and tabular readout", () => {
    // Enable temporal so its floor slider renders.
    act(() => useFilterStore.getState().setTier("temporal", true));
    renderWithClient(createElement(TierDial));
    const slider = screen.getByRole("slider", { name: "temporal confidence floor" });
    fireEvent.change(slider, { target: { value: "0.5" } });
    expect(useFilterStore.getState().minConfidence.temporal).toBe(0.5);
    // The readout is data-bearing → tabular numerals.
    const readout = screen.getByText("50%");
    expect(readout.hasAttribute("data-tabular")).toBe(true);
  });

  it("renders the semantic tier INAPPLICABLE in time-travel (designed state, not error)", () => {
    act(() => useViewStore.getState().setTimelineMode({ kind: "time-travel", at: 1 }));
    renderWithClient(createElement(TierDial));
    const semantic = screen.getByRole("switch", { name: "semantic tier" });
    expect((semantic as HTMLButtonElement).disabled).toBe(true);
    expect(semantic.getAttribute("data-state")).toBe("inapplicable");
    // The other three stay live.
    expect(
      (screen.getByRole("switch", { name: "declared tier" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("renders the semantic tier OFFLINE when rag is down, derived through stores", async () => {
    // The mock serves a tiers block marking semantic unavailable; the dial
    // reads it through useGraphSliceAvailability, never the raw block.
    mock.degrade("semantic", "rag is not available");
    renderWithClient(createElement(TierDial));
    await waitFor(() => {
      const semantic = screen.getByRole("switch", { name: "semantic tier" });
      expect((semantic as HTMLButtonElement).disabled).toBe(true);
      expect(semantic.getAttribute("data-state")).toBe("offline");
    });
    // It is a designed degraded state, not an error: the offline copy shows.
    expect(screen.getByText("offline")).toBeTruthy();
  });
});

describe("FilterBar surface + a11y (S26)", () => {
  it("renders a labelled, pressed-state sidebar toggle", () => {
    renderWithClient(
      createElement(FilterBar, {
        hidden: { nodes: 0, edges: 0 },
        sidebarOpen: false,
        onSidebarToggle: () => {},
      }),
    );
    const toggle = screen.getByRole("button", { name: "open filter panel" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("renders the hidden-count cost chip with tabular numerals when filters hide nodes", () => {
    renderWithClient(createElement(FilterBar, { hidden: { nodes: 12, edges: 3 } }));
    const chip = screen.getByText("12 nodes · 3 edges hidden");
    expect(chip.hasAttribute("data-tabular")).toBe(true);
  });
});

describe("WorkingSet trail add/remove/clear (S26)", () => {
  it("hides entirely when the working set is empty (constellation needs no provenance)", () => {
    const { container } = renderWithClient(createElement(WorkingSet));
    expect(container.querySelector("[data-working-set]")).toBeNull();
  });

  it("renders a tabular size readout and removable breadcrumbs; remove drives the store", () => {
    act(() => {
      useViewStore.getState().addToWorkingSet("feature:auth");
      useViewStore.getState().addToWorkingSet("feature:net");
    });
    renderWithClient(createElement(WorkingSet));
    // Size readout is a data-bearing count → tabular numerals.
    const size = screen.getByLabelText("2 expansions in working set");
    expect(size.hasAttribute("data-tabular")).toBe(true);
    expect(size.textContent).toBe("2");
    // Each expansion is a removable breadcrumb; removing drives the store.
    fireEvent.click(screen.getByRole("button", { name: "Collapse feature:auth" }));
    expect(useViewStore.getState().workingSet).toEqual(["feature:net"]);
    // The clear chip resets to the constellation base.
    fireEvent.click(screen.getByRole("button", { name: "clear to constellation" }));
    expect(useViewStore.getState().workingSet).toEqual([]);
  });

  it("keyboard E expands the selection's ego; Backspace collapses the last expansion", () => {
    act(() => useViewStore.getState().select("feature:auth"));
    renderWithClient(createElement(WorkingSet));
    fireEvent.keyDown(window, { key: "e" });
    expect(useViewStore.getState().workingSet).toEqual(["feature:auth"]);
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(useViewStore.getState().workingSet).toEqual([]);
  });
});

describe("Discover surface: sanctioned mark + quarantined states (S26)", () => {
  it("offers a discover affordance carrying the sanctioned semantic domain mark", () => {
    act(() => useViewStore.getState().select("feature:auth"));
    renderWithClient(createElement(Discover));
    const trigger = screen.getByRole("button", { name: /discover related/ });
    // The affordance carries the semantic tier mark (the species color via the
    // shared registry), not a literal glyph.
    expect(
      within(trigger).getByRole("img", { name: "semantic" }).tagName.toLowerCase(),
    ).toBe("svg");
  });

  it("renders the discover-OFFLINE designed state when rag is down (not an error)", async () => {
    mock.degrade("semantic", "rag is not available");
    act(() => useViewStore.getState().select("feature:auth"));
    renderWithClient(createElement(Discover));
    // Open the panel to fire the discovery request, which 502s under degradation.
    fireEvent.click(screen.getByRole("button", { name: /discover related/ }));
    await waitFor(() => {
      const offline = screen.getByText(/semantic discovery offline/);
      // The offline copy lives in a dedicated designed-state hook, not a raw
      // error surface.
      expect(offline.hasAttribute("data-discover-offline")).toBe(true);
    });
  });

  it("hides entirely with no selection and nothing open", () => {
    const { container } = renderWithClient(createElement(Discover));
    expect(container.firstChild).toBeNull();
  });
});
