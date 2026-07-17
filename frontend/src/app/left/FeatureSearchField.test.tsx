// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const commit = vi.fn();
const setValue = vi.fn();
const clear = vi.fn();
let draftValue = "";

vi.mock("../../stores/server/queries", () => ({
  useActiveScope: () => "scope-a",
  useFiltersVocabularyView: () => ({
    featureTags: ["dashboard-left-rail", "dashboard-gui", "timeline"],
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
    // The display name AND the raw tag are both shown on a suggestion row.
    expect(screen.getByText("Dashboard Left Rail")).toBeTruthy();
    expect(screen.getByText("dashboard-left-rail")).toBeTruthy();

    // Choosing a suggestion commits the RAW hyphenated tag to the filter.
    fireEvent.mouseDown(screen.getByText("Dashboard Left Rail"));
    expect(commit).toHaveBeenCalledWith("dashboard-left-rail");
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

    expect(screen.getByText("dashboard-left-rail")).toBeTruthy();
    expect(screen.queryByText("dashboard-gui")).toBeNull();
    expect(screen.queryByText("timeline")).toBeNull();
  });

  it("browses the FULL vocabulary on focus even when a filter is applied (#6.1)", () => {
    // The field echoes an already-applied/committed feature filter. Re-focusing to
    // pick a DIFFERENT feature must show every candidate — the applied filter must
    // never constrain the dropdown (it narrows the rail tree, not this list).
    draftValue = "dashboard-left-rail";
    render(createElement(FeatureSearchField));
    fireEvent.focus(screen.getByLabelText("Filter the vault by feature"));

    expect(screen.getByText("dashboard-left-rail")).toBeTruthy();
    expect(screen.getByText("dashboard-gui")).toBeTruthy();
    expect(screen.getByText("timeline")).toBeTruthy();
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
