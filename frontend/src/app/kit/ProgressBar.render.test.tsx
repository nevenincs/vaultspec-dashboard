// @vitest-environment happy-dom
//
// ProgressBar kit primitive (W01.P02.S05): renders without crashing, exposes the
// ARIA progressbar contract with a clamped value, and renders the optional
// tabular readout.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProgressBar } from "./ProgressBar";

afterEach(cleanup);

describe("ProgressBar", () => {
  it("exposes the ARIA progressbar contract", () => {
    const bar = render(
      <ProgressBar value={18} max={24} label="plan completion" />,
    ).getByRole("progressbar", { name: "plan completion" });
    expect(bar.getAttribute("aria-valuenow")).toBe("18");
    expect(bar.getAttribute("aria-valuemax")).toBe("24");
  });

  it("clamps an over-max value to the bound", () => {
    const bar = render(<ProgressBar value={50} max={24} />).getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("24");
  });

  it("renders the optional tabular value readout", () => {
    const { container } = render(<ProgressBar value={3} max={10} showValue />);
    // The value and max sit either side of a decorative slash glyph, so the
    // readout spans three nodes; assert the composed textContent, not a single
    // text node.
    const readout = container.querySelector("[data-tabular]");
    expect(readout).not.toBeNull();
    expect(readout?.textContent).toBe("3/10");
  });
});
