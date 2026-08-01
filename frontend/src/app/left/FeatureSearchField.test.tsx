// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const commit = vi.fn();
const setValue = vi.fn();
const clear = vi.fn();
let draftValue = "";

// The served roster the open dropdown joins its per-feature metadata from — the
// only mocked dependency is the DATA seam; every string below resolves through the
// real localization runtime. `dashboard-left-rail` carries a full entry (a
// composition plus a multi-decision span), `dashboard-gui` carries only totals (an
// older engine, or a feature the engine can say nothing more about), and `timeline`
// is deliberately ABSENT — so the three rows prove the full line, no line, and no
// line respectively, and never a zero standing in for an unknown.
vi.mock("../../stores/server/queries", () => ({
  useActiveScope: () => "scope-a",
  useFiltersVocabularyView: () => ({
    featureTags: ["dashboard-left-rail", "dashboard-gui", "timeline"],
  }),
  useFeatureRosterView: () => ({
    loading: false,
    degraded: false,
    degradedTiers: [],
    reasons: {},
    roster: [
      {
        feature: "dashboard-left-rail",
        doc_count: 12,
        types_present: 4,
        type_counts: { research: 2, adr: 3, plan: 1, exec: 6 },
        plan_state: "in-progress",
        adr_dates: { first: "2026-06-14", last: "2026-08-01" },
      },
      { feature: "dashboard-gui", doc_count: 1, types_present: 1 },
    ],
  }),
}));
vi.mock("../../stores/view/dashboardFeatureFilter", () => ({
  useDashboardFeatureFilterDraft: () => ({
    value: draftValue,
    setValue,
    commit,
    clear,
  }),
}));

import { FeatureSearchField } from "./FeatureSearchField";

beforeEach(() => {
  commit.mockClear();
  setValue.mockClear();
  clear.mockClear();
  draftValue = "";
});

afterEach(() => cleanup());

describe("FeatureSearchField (feature autofill)", () => {
  it("shows the preloaded vocabulary on focus and applies a chosen tag", () => {
    render(createElement(FeatureSearchField));
    const input = screen.getByLabelText("Filter the vault by feature");

    // No list until focused — focusing reveals the preloaded suggestions.
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.focus(input);

    expect(screen.getByRole("listbox")).toBeTruthy();
    // A row shows the READABLE NAME over its served metadata. The raw tag is
    // no longer printed — it said the same thing as the name — and rides the row's
    // hover tooltip instead (owner review).
    expect(screen.getByText("Dashboard Left Rail")).toBeTruthy();
    expect(screen.queryByText("dashboard-left-rail")).toBeNull();
    expect(screen.getByRole("option", { name: /Dashboard Left Rail/ }).title).toBe(
      "dashboard-left-rail",
    );

    // Choosing a suggestion commits the RAW hyphenated tag to the filter.
    fireEvent.mouseDown(screen.getByText("Dashboard Left Rail"));
    expect(commit).toHaveBeenCalledWith("dashboard-left-rail");
  });

  it("shows the SERVED composition and decision span, and nothing when unserved", () => {
    render(createElement(FeatureSearchField));
    fireEvent.focus(screen.getByLabelText("Filter the vault by feature"));

    // Per-type counts in canonical pipeline order, plural-correct, followed by the
    // span of the decisions that bind the feature. Every value is engine-served and
    // never re-counted from a client listing (ADR D4).
    expect(
      screen.getByText(
        "2 research notes, 3 decisions, 1 plan, 6 step records, Jun 14 – Aug 1",
      ),
    ).toBeTruthy();
    // The row that used to print a bare total now prints nothing: a roster entry
    // carrying only totals says nothing the name does not already say.
    const gui = screen.getByRole("option", { name: /Dashboard Gui/ });
    expect(gui.querySelector("[data-feature-suggestion-meta]")).toBeNull();
    // `timeline` is not on the roster at all, so its row carries no second line.
    const timeline = screen.getByRole("option", { name: /Timeline/ });
    expect(timeline.querySelector("[data-feature-suggestion-meta]")).toBeNull();
  });

  it("narrows suggestions by the display string and the raw tag as the user types", () => {
    // The draft echoes the typed text; setValue mirrors the real hook so the
    // controlled field updates as the user types.
    setValue.mockImplementation((v: unknown) => {
      draftValue = typeof v === "string" ? v : "";
    });
    render(createElement(FeatureSearchField));
    const input = screen.getByLabelText("Filter the vault by feature");
    fireEvent.focus(input);
    // Typing is what narrows the list — a keystroke marks the query as edited.
    fireEvent.change(input, { target: { value: "Left Rail" } });

    expect(screen.getByText("Dashboard Left Rail")).toBeTruthy();
    expect(screen.queryByText("Dashboard Gui")).toBeNull();
    expect(screen.queryByText("Timeline")).toBeNull();
  });

  it("browses the FULL vocabulary on focus even when a filter is applied (#6.1)", () => {
    // The field echoes an already-applied/committed feature filter. Re-focusing to
    // pick a DIFFERENT feature must show every candidate — the applied filter must
    // never constrain the dropdown (it narrows the rail tree, not this list).
    draftValue = "dashboard-left-rail";
    render(createElement(FeatureSearchField));
    fireEvent.focus(screen.getByLabelText("Filter the vault by feature"));

    expect(screen.getByText("Dashboard Left Rail")).toBeTruthy();
    expect(screen.getByText("Dashboard Gui")).toBeTruthy();
    expect(screen.getByText("Timeline")).toBeTruthy();
  });

  it("commits the active suggestion on Enter after ArrowDown", () => {
    render(createElement(FeatureSearchField));
    const input = screen.getByLabelText("Filter the vault by feature");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    // First suggestion (alphabetical for empty input): dashboard-gui.
    expect(commit).toHaveBeenCalledWith("dashboard-gui");
  });

  it("closes the suggestion list on Escape without clearing", () => {
    render(createElement(FeatureSearchField));
    const input = screen.getByLabelText("Filter the vault by feature");
    fireEvent.focus(input);
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(clear).not.toHaveBeenCalled();
  });
});
