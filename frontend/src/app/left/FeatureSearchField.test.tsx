// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const commit = vi.fn();
const setValue = vi.fn();
const clear = vi.fn();
let draftValue = "";

// The served roster the open dropdown joins its per-feature document counts from.
// `timeline` is deliberately ABSENT so a suggestion the roster does not carry proves
// it renders its name alone rather than a zero standing in for an unknown.
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
      { feature: "dashboard-left-rail", doc_count: 12, types_present: 4 },
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
    // A row shows the READABLE NAME over its served document count. The raw tag is
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

  it("shows the SERVED document count per feature, and none when unserved", () => {
    render(createElement(FeatureSearchField));
    fireEvent.focus(screen.getByLabelText("Filter the vault by feature"));

    // Counts come from the roster the engine serves — plural-correct, and never
    // re-counted from a client listing.
    expect(screen.getByText("12 documents")).toBeTruthy();
    expect(screen.getByText("1 document")).toBeTruthy();
    // `timeline` is not on the roster, so its row carries no second line at all.
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
