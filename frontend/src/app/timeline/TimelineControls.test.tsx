// @vitest-environment happy-dom
//
// The timeline control bar (dashboard-timeline ADR "Control surfaces", W04.P08.S56):
// the contracts the bar must hold.
//
// Pure helpers (fit / zoom / jump / minimap projection) are tested directly — no
// DOM, no store, no clock read inside the helper (the clock is passed in), so the
// math is verified in isolation. The COMPONENT contracts (lane toggles, the
// vocabulary-driven filter chips, the tier dial's time-travel inapplicability, and
// the fit/zoom/jump controls writing the store) are tested through the REAL stores
// client transport (mockEngine) over the live `/filters` and `/graph/lineage` wire
// shapes — no component-internal doubles — so "vocabulary comes from the engine
// enumeration, never hardcoded" is proven against the real wire, not asserted.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { useFilterStore } from "../../stores/view/filters";
import { useViewStore } from "../../stores/view/viewStore";
import { MockEngine, MOCK_SCOPE } from "../../testing/mockEngine";
import { Minimap, brushOnRibbon, corpusSpan, ribbonXToCorpus } from "./Minimap";
import { TimelineControls, fitSpan, jumpToDateOffset } from "./TimelineControls";
import { DEFAULT_PX_PER_MS, useTimelineStore } from "./Timeline";
import {
  MAX_PX_PER_MS,
  MIN_PX_PER_MS,
  TIMELINE_ORIGIN_MS,
  timeToStripX,
  xToTime,
} from "./scrollStrip";

const DAY = 24 * 3600 * 1000;
const VIEWPORT = 800;

// --- pure fit/zoom/jump helpers (no DOM) ----------------------------------------

describe("fitSpan (S51/S52)", () => {
  it("fits a corpus span into the viewport with the span start docked at the inset", () => {
    const from = Date.parse("2026-01-01T00:00:00Z");
    const to = from + 30 * DAY;
    const { pxPerMs, scrollOffset } = fitSpan(from, to, VIEWPORT, 24);
    // The span start lands at the left inset (24px): timeToX(from) === 24.
    const xOfFrom = timeToStripX(from, TIMELINE_ORIGIN_MS, pxPerMs) - scrollOffset;
    expect(xOfFrom).toBeCloseTo(24, 5);
    // The span end lands within the viewport (right inset), not off-screen.
    const xOfTo = timeToStripX(to, TIMELINE_ORIGIN_MS, pxPerMs) - scrollOffset;
    expect(xOfTo).toBeLessThanOrEqual(VIEWPORT);
    expect(xOfTo).toBeGreaterThan(VIEWPORT - 60);
  });

  it("clamps the scale into the supported zoom band for a tiny span", () => {
    const from = Date.parse("2026-01-01T00:00:00Z");
    // A 1-minute span would demand a scale well above MAX — it must clamp.
    const { pxPerMs } = fitSpan(from, from + 60_000, VIEWPORT);
    expect(pxPerMs).toBeLessThanOrEqual(MAX_PX_PER_MS);
    expect(pxPerMs).toBeGreaterThanOrEqual(MIN_PX_PER_MS);
  });

  it("never scrolls before the strip origin (offset >= 0)", () => {
    const { scrollOffset } = fitSpan(0, 10 * DAY, VIEWPORT);
    expect(scrollOffset).toBeGreaterThanOrEqual(0);
  });
});

describe("jumpToDateOffset (S53)", () => {
  it("centres the chosen instant in the viewport at the unchanged scale", () => {
    const t = Date.parse("2026-03-15T00:00:00Z");
    const offset = jumpToDateOffset(t, DEFAULT_PX_PER_MS, VIEWPORT);
    // The instant sits at the viewport centre: xToTime(centre) === t.
    const centreT = xToTime(
      VIEWPORT / 2,
      TIMELINE_ORIGIN_MS,
      DEFAULT_PX_PER_MS,
      offset,
    );
    expect(centreT).toBeCloseTo(t, 0);
  });

  it("clamps to the origin for an instant earlier than half a viewport from t=0", () => {
    expect(jumpToDateOffset(0, DEFAULT_PX_PER_MS, VIEWPORT)).toBe(0);
  });
});

// --- minimap pure projection (no DOM) -------------------------------------------

describe("Minimap projection (S54)", () => {
  it("derives a positive corpus span from date bounds", () => {
    const span = corpusSpan(
      { from: "2026-01-01T00:00:00Z", to: "2026-02-01T00:00:00Z" },
      Date.now(),
    );
    expect(span.toMs).toBeGreaterThan(span.fromMs);
  });

  it("projects the visible window onto the ribbon as a brush within bounds", () => {
    const span = corpusSpan(
      { from: "2026-01-01T00:00:00Z", to: "2026-04-01T00:00:00Z" },
      Date.now(),
    );
    const ribbonWidth = 240;
    // Dock the strip near the corpus middle.
    const mid = (span.fromMs + span.toMs) / 2;
    const scrollOffset = timeToStripX(mid, TIMELINE_ORIGIN_MS, DEFAULT_PX_PER_MS);
    const brush = brushOnRibbon(
      scrollOffset,
      DEFAULT_PX_PER_MS,
      VIEWPORT,
      span,
      ribbonWidth,
    );
    expect(brush.x).toBeGreaterThanOrEqual(0);
    expect(brush.x + brush.width).toBeLessThanOrEqual(ribbonWidth + 0.01);
    expect(brush.width).toBeGreaterThan(0);
  });

  it("inverts a ribbon x back to a corpus instant", () => {
    const span = corpusSpan(
      { from: "2026-01-01T00:00:00Z", to: "2026-02-01T00:00:00Z" },
      Date.now(),
    );
    expect(ribbonXToCorpus(0, span, 240)).toBeCloseTo(span.fromMs, 0);
    expect(ribbonXToCorpus(240, span, 240)).toBeCloseTo(span.toMs, 0);
  });
});

// --- component contracts (real stores transport, live wire shape) ---------------

function renderControls() {
  return render(
    <QueryClientProvider client={queryClient}>
      <TimelineControls viewportWidth={VIEWPORT} />
    </QueryClientProvider>,
  );
}

describe("TimelineControls component (S46-S55)", () => {
  beforeEach(() => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    useViewStore.getState().setScope(MOCK_SCOPE);
    useFilterStore.getState().reset();
    useTimelineStore.getState().setPxPerMs(DEFAULT_PX_PER_MS);
    useTimelineStore.getState().setScrollOffset(0);
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
    useViewStore.getState().setTimelineMode({ kind: "live" });
    useFilterStore.getState().reset();
    engineClient.useTransport((input, init) => fetch(input, init));
    vi.restoreAllMocks();
  });

  it("toggles the execution lane via the Steps & summaries switch and writes the store (S46/S65)", () => {
    renderControls();
    // The binding board (AppShell 117:2) collapses the lanes to two and exposes ONE
    // control — the "Steps & summaries" switch — which toggles the execution lane.
    // It carries the switch role + aria-checked (consistent with the TierDial), and
    // flips the execution group's exec + codify phase keys together.
    const sw = screen.getByRole("switch", { name: "Steps & summaries" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw);
    expect(useTimelineStore.getState().laneVisibility.exec).toBe(false);
    expect(useTimelineStore.getState().laneVisibility.codify).toBe(false);
    expect(
      screen
        .getByRole("switch", { name: "Steps & summaries" })
        .getAttribute("aria-checked"),
    ).toBe("false");
    // The design lane has no toggle of its own (always shown); its phases stay on.
    expect(useTimelineStore.getState().laneVisibility.research).toBe(true);
  });

  it("sources relation chips from the engine enumeration as switches and toggling writes the store (S47/S65)", async () => {
    renderControls();
    // The mock corpus emits these relations on its edges; the chip vocabulary is
    // the engine /filters enumeration, NOT a hardcoded list. S65: the chip is a
    // switch (role + aria-checked), labelled "<facet> <value>".
    const group = await screen.findByLabelText("relation filter");
    const implementsChip = await within(group).findByRole("switch", {
      name: "relation implements",
    });
    expect(implementsChip.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(implementsChip);
    expect(useFilterStore.getState().relations).toContain("implements");
  });

  it("sources feature chips from the engine enumeration as switches and writes featureTags (S49/S65)", async () => {
    renderControls();
    const group = await screen.findByLabelText("feature filter");
    const featureChip = await within(group).findByRole("switch", {
      name: "feature editor-demo",
    });
    fireEvent.click(featureChip);
    expect(useFilterStore.getState().featureTags).toContain("editor-demo");
  });

  it("reuses the tier dial and marks semantic inapplicable in time-travel (S48)", () => {
    useViewStore.getState().setTimelineMode({ kind: "time-travel", at: Date.now() });
    renderControls();
    // The dial is present (reused, not reinvented).
    expect(screen.getByLabelText("tier dial")).toBeTruthy();
    const semantic = screen.getByRole("switch", { name: "semantic tier" });
    // In time-travel the semantic tier is a designed inapplicable state.
    expect(semantic.getAttribute("data-state")).toBe("inapplicable");
    expect((semantic as HTMLButtonElement).disabled).toBe(true);
  });

  it("zoom in / out rescale pxPerMs within the band (S50)", () => {
    renderControls();
    const before = useTimelineStore.getState().pxPerMs;
    fireEvent.click(screen.getByRole("button", { name: "zoom in" }));
    const afterIn = useTimelineStore.getState().pxPerMs;
    expect(afterIn).toBeGreaterThan(before);
    expect(afterIn).toBeLessThanOrEqual(MAX_PX_PER_MS);
    fireEvent.click(screen.getByRole("button", { name: "zoom out" }));
    expect(useTimelineStore.getState().pxPerMs).toBeLessThan(afterIn);
  });

  it("fit-all fits the corpus span from the engine date bounds (S51)", async () => {
    renderControls();
    // Wait for the vocabulary (and thus date bounds) to land.
    await screen.findByRole("switch", { name: "feature editor-demo" });
    const beforeScale = useTimelineStore.getState().pxPerMs;
    fireEvent.click(screen.getByRole("button", { name: "fit all" }));
    // Fitting the multi-feature corpus week changes the scale and docks a
    // non-trivial offset (the corpus does not start at t=0).
    expect(useTimelineStore.getState().pxPerMs).not.toBe(beforeScale);
    expect(useTimelineStore.getState().scrollOffset).toBeGreaterThan(0);
  });

  it("fit-feature is disabled until a feature filter is active (S52)", async () => {
    renderControls();
    expect(
      (screen.getByRole("button", { name: "fit feature" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    const group = await screen.findByLabelText("feature filter");
    fireEvent.click(
      await within(group).findByRole("switch", { name: "feature editor-demo" }),
    );
    expect(
      (screen.getByRole("button", { name: "fit feature" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("jump-to-date centres the chosen date and is disabled when empty (S53)", () => {
    renderControls();
    expect(
      (screen.getByRole("button", { name: "go to date" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    const input = screen.getByLabelText("jump to date");
    fireEvent.change(input, { target: { value: "2026-03-15" } });
    fireEvent.click(screen.getByRole("button", { name: "go to date" }));
    const t = Date.parse("2026-03-15");
    const expected = jumpToDateOffset(t, useTimelineStore.getState().pxPerMs, VIEWPORT);
    expect(useTimelineStore.getState().scrollOffset).toBeCloseTo(expected, 0);
  });

  it("renders the minimap scrubber as a slider (S54)", () => {
    renderControls();
    expect(
      screen.getByRole("slider", { name: "timeline overview scrubber" }),
    ).toBeTruthy();
  });

  it("renders the range chip with play and clear when a range is committed (S55)", () => {
    useFilterStore.getState().setDateRange({
      from: "2026-01-05T00:00:00Z",
      to: "2026-01-09T00:00:00Z",
    });
    renderControls();
    expect(screen.getByLabelText("play the selected range")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("clear date range"));
    // Clearing returns toward LIVE: the single date-range writer empties.
    expect(useFilterStore.getState().dateRange).toEqual({});
  });
});

// --- the minimap as a mounted scrubber writes scrollOffset (S54) ----------------

describe("Minimap scrubber writes scrollOffset (S54)", () => {
  beforeEach(() => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    useViewStore.getState().setScope(MOCK_SCOPE);
    useTimelineStore.getState().setScrollOffset(0);
  });
  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("nudges the scroll offset from the keyboard (a real, keyboard-reachable scrubber)", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Minimap viewportWidth={VIEWPORT} ribbonWidth={240} />
      </QueryClientProvider>,
    );
    const ribbon = screen.getByRole("slider", { name: "timeline overview scrubber" });
    fireEvent.keyDown(ribbon, { key: "ArrowRight" });
    expect(useTimelineStore.getState().scrollOffset).toBeGreaterThan(0);
  });
});
