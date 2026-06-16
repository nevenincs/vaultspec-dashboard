// @vitest-environment happy-dom
//
// The activity-rail segmented tab bar (binding Figma `RightRail` / `ActivityTabs`,
// node 17:563; refined by the status-overview ADR node 112:2): a roving-keys ARIA
// tablist with Status | Inspect | Search | Changes, the active tab a raised pill.
// These assertions exercise the a11y contract — the roving tabindex, arrow-key
// movement that activates, and the active styling cue — not just that it renders.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { RailTabs, type RailTabId } from "./RailTabs";

function Harness({ initial = "status" as RailTabId }) {
  const [tab, setTab] = useState<RailTabId>(initial);
  return createElement(RailTabs, { active: tab, onChange: setTab });
}

afterEach(() => cleanup());

describe("RailTabs segmented control (Figma node 17:563 / 112:2)", () => {
  it("renders the four refined tabs in order with a single tablist", () => {
    render(createElement(Harness));
    const tablist = screen.getByRole("tablist", { name: "activity rail tabs" });
    expect(tablist).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("data-rail-tab"))).toEqual([
      "status",
      "inspect",
      "search",
      "changes",
    ]);
  });

  it("puts only the active tab in the Tab order (roving tabindex)", () => {
    render(createElement(Harness));
    const tabs = screen.getAllByRole("tab");
    // Status is active by default → tabIndex 0; the rest are -1.
    expect(tabs[0]!.getAttribute("tabindex")).toBe("0");
    expect(tabs.slice(1).every((t) => t.getAttribute("tabindex") === "-1")).toBe(true);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
  });

  it("marks the active tab with aria-controls pointing at its panel", () => {
    render(createElement(Harness, { initial: "search" }));
    const search = screen.getByRole("tab", { name: /search/i });
    expect(search.getAttribute("aria-selected")).toBe("true");
    expect(search.getAttribute("aria-controls")).toBe("rail-panel-search");
    expect(search.getAttribute("data-rail-tab-active")).toBe("");
  });

  it("moves and activates with ArrowRight (segmented-control roving keys)", () => {
    render(createElement(Harness));
    const tabs = screen.getAllByRole("tab");
    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    // Inspect becomes selected and focused.
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[1]);
  });

  it("wraps from the first tab to the last with ArrowLeft", () => {
    render(createElement(Harness));
    const tabs = screen.getAllByRole("tab");
    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: "ArrowLeft" });
    // Wraps to Changes (the last tab).
    expect(tabs[3]!.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[3]);
  });

  it("activates a tab on click", () => {
    render(createElement(Harness));
    const changes = screen.getByRole("tab", { name: /changes/i });
    fireEvent.click(changes);
    expect(changes.getAttribute("aria-selected")).toBe("true");
  });
});
