// @vitest-environment happy-dom
//
// Kit Tab render contract: it exposes the tab role with aria-selected, fires
// onSelect, and (closable variant) fires onClose from its own hit target without
// also selecting the tab. Core vitest matchers only (no jest-dom in this repo).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Tab } from "./Tab";

afterEach(cleanup);

describe("Tab", () => {
  it("exposes the tab role reflecting the active state", () => {
    render(
      <Tab active onSelect={() => {}}>
        Status
      </Tab>,
    );
    expect(
      screen.getByRole("tab", { name: "Status" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("fires onSelect on click", () => {
    const onSelect = vi.fn();
    render(
      <Tab active={false} onSelect={onSelect}>
        Changes
      </Tab>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Changes" }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("fires onClose from the close control without selecting", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <Tab active onSelect={onSelect} onClose={onClose}>
        Search
      </Tab>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close tab" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
