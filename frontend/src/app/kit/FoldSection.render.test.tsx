// @vitest-environment happy-dom
//
// FoldSection kit primitive: the one canonical fold. Verifies the flush header
// (no border / no card background), the controlled open/onToggle contract, the
// twisty + label + body wiring, and the header-button pass-through used by the
// rails' roving-tabindex keyboard nav.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FoldSection } from "./FoldSection";

afterEach(cleanup);

describe("FoldSection", () => {
  it("renders a flush disclosure header with no border or card background", () => {
    render(<FoldSection open={false} onToggle={() => undefined} label="Open plans" />);
    const toggle = screen.getByRole("button");
    expect(toggle.className).not.toMatch(/\bborder\b/);
    // No RESTING card background — only a hover-prefixed wash is allowed.
    expect(toggle.className).not.toMatch(/(^|\s)bg-paper-(raised|sunken)/);
    expect(toggle.className).toContain("hover:bg-paper-sunken");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("mounts the body only when open and links it via aria-controls", () => {
    const { rerender } = render(
      <FoldSection open={false} onToggle={() => undefined} bodyId="b1" label="L">
        <p>child</p>
      </FoldSection>,
    );
    expect(screen.queryByText("child")).toBeNull();
    rerender(
      <FoldSection open onToggle={() => undefined} bodyId="b1" label="L">
        <p>child</p>
      </FoldSection>,
    );
    expect(screen.getByText("child")).toBeTruthy();
    expect(screen.getByRole("button").getAttribute("aria-controls")).toBe("b1");
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true");
  });

  it("flips the twisty and fires onToggle on click", () => {
    const onToggle = vi.fn();
    render(<FoldSection open={false} onToggle={onToggle} label="L" />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("forwards headerRef and headerProps onto the header button (roving nav)", () => {
    const ref = createRef<HTMLButtonElement>();
    const onKeyDown = vi.fn();
    render(
      <FoldSection
        open={false}
        onToggle={() => undefined}
        label="L"
        headerRef={ref}
        headerProps={{ tabIndex: 0, onKeyDown }}
      />,
    );
    expect(ref.current).toBe(screen.getByRole("button"));
    expect(ref.current?.tabIndex).toBe(0);
    fireEvent.keyDown(ref.current!, { key: "ArrowDown" });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });
});
