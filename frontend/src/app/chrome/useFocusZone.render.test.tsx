// @vitest-environment happy-dom
//
// The useFocusZone hook rendered as real DOM (keyboard-navigation W01.P01.S02).
// Exercises the render-time registration contract the pure unit tests cannot:
// the single-tab-stop fallback (first item carries tabIndex 0 before any focus),
// roving in lockstep with the active key, and arrow-key movement moving both the
// active key and DOM focus. Core vitest matchers only (no jest-dom in this
// project).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useFocusZone } from "./useFocusZone";

afterEach(cleanup);

const ITEMS = ["alpha", "beta", "gamma"];

function ZoneHarness({
  initialActive = null,
  disabledKeys = [],
}: {
  initialActive?: string | null;
  disabledKeys?: readonly string[];
}) {
  const [active, setActive] = useState<string | null>(initialActive);
  const disabled = new Set(disabledKeys);
  const zone = useFocusZone({
    orientation: "vertical",
    wrap: false,
    activeKey: active,
    onActiveKeyChange: setActive,
  });
  return (
    <ul>
      {ITEMS.map((key) => {
        const isDisabled = disabled.has(key);
        const props = zone.rove(key, { disabled: isDisabled });
        return (
          <li key={key}>
            <button
              type="button"
              data-key={key}
              disabled={isDisabled}
              ref={props.ref as (el: HTMLButtonElement | null) => void}
              tabIndex={props.tabIndex}
              onKeyDown={props.onKeyDown}
            >
              {key}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function buttonFor(key: string): HTMLButtonElement {
  return screen.getByText(key) as HTMLButtonElement;
}

describe("useFocusZone (rendered)", () => {
  it("makes the first item the sole tab stop before anything is focused", () => {
    render(<ZoneHarness />);
    expect(buttonFor("alpha").tabIndex).toBe(0);
    expect(buttonFor("beta").tabIndex).toBe(-1);
    expect(buttonFor("gamma").tabIndex).toBe(-1);
  });

  it("falls back to the first item until the active key is a known item, then roves to it", () => {
    const { rerender } = render(<ZoneHarness initialActive="beta" />);
    // First render has no prior order, so the first item holds the sole tab stop
    // (an active key that is not yet a rendered item must never leave the zone
    // with NO tab stop).
    expect(buttonFor("alpha").tabIndex).toBe(0);
    expect(buttonFor("beta").tabIndex).toBe(-1);

    // After a re-render the active key is a known item and claims the tab stop.
    rerender(<ZoneHarness initialActive="beta" />);
    expect(buttonFor("alpha").tabIndex).toBe(-1);
    expect(buttonFor("beta").tabIndex).toBe(0);
    expect(buttonFor("gamma").tabIndex).toBe(-1);
  });

  it("moves active key and DOM focus on ArrowDown, and stops at the end", () => {
    render(<ZoneHarness initialActive="alpha" />);
    const alpha = buttonFor("alpha");
    alpha.focus();

    fireEvent.keyDown(alpha, { key: "ArrowDown" });
    expect(document.activeElement).toBe(buttonFor("beta"));
    expect(buttonFor("beta").tabIndex).toBe(0);

    fireEvent.keyDown(buttonFor("beta"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(buttonFor("gamma"));

    // Clamp: ArrowDown at the last item is a no-op (wrap is false).
    fireEvent.keyDown(buttonFor("gamma"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(buttonFor("gamma"));
  });

  it("keeps a disabled active item out of the tab ring and skips it while roving", () => {
    render(<ZoneHarness initialActive="beta" disabledKeys={["beta"]} />);
    const alpha = buttonFor("alpha");
    const beta = buttonFor("beta");
    const gamma = buttonFor("gamma");

    // The disabled active key remains controlled state, but it cannot claim the
    // zone's one tab stop. The first enabled item must remain reachable.
    expect(alpha.tabIndex).toBe(0);
    expect(beta.tabIndex).toBe(-1);
    expect(beta.disabled).toBe(true);

    alpha.focus();
    fireEvent.keyDown(alpha, { key: "ArrowDown" });
    expect(document.activeElement).toBe(gamma);
    expect(gamma.tabIndex).toBe(0);
  });

  it("reassigns the tab stop when the current roving item becomes disabled", () => {
    const { rerender } = render(<ZoneHarness initialActive="beta" />);
    // A second render establishes beta as the current roving item.
    rerender(<ZoneHarness initialActive="beta" />);
    expect(buttonFor("beta").tabIndex).toBe(0);

    rerender(<ZoneHarness initialActive="beta" disabledKeys={["beta"]} />);
    expect(buttonFor("alpha").tabIndex).toBe(0);
    expect(buttonFor("beta").tabIndex).toBe(-1);
    expect(buttonFor("gamma").tabIndex).toBe(-1);
  });

  it("stops a consumed arrow from reaching a window listener (no double-fire)", () => {
    let windowKeyCalls = 0;
    const onWindowKey = () => {
      windowKeyCalls += 1;
    };
    window.addEventListener("keydown", onWindowKey);
    try {
      render(<ZoneHarness initialActive="alpha" />);
      const alpha = buttonFor("alpha");
      alpha.focus();

      // An owned arrow is consumed and must NOT reach the global dispatcher.
      fireEvent.keyDown(alpha, { key: "ArrowDown" });
      expect(windowKeyCalls).toBe(0);

      // A key the zone does not own still bubbles (e.g. Enter to activate).
      fireEvent.keyDown(buttonFor("beta"), { key: "Enter" });
      expect(windowKeyCalls).toBe(1);
    } finally {
      window.removeEventListener("keydown", onWindowKey);
    }
  });

  it("jumps to the first item on Home and the last on End", () => {
    render(<ZoneHarness initialActive="beta" />);
    buttonFor("beta").focus();

    fireEvent.keyDown(buttonFor("beta"), { key: "End" });
    expect(document.activeElement).toBe(buttonFor("gamma"));

    fireEvent.keyDown(buttonFor("gamma"), { key: "Home" });
    expect(document.activeElement).toBe(buttonFor("alpha"));
  });
});
