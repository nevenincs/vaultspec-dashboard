// @vitest-environment happy-dom
//
// Kit Slider render contract: it mounts under the default theme as an ARIA slider,
// reflects the controlled value and bounds, emits the next number on change, and
// shows the optional readout when requested.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Slider } from "./Slider";

afterEach(cleanup);

describe("Slider", () => {
  it("renders an ARIA slider reflecting value and bounds", () => {
    render(
      <Slider value={120} onChange={() => {}} label="Label size" min={50} max={200} />,
    );
    const slider = screen.getByRole("slider", {
      name: "Label size",
    }) as HTMLInputElement;
    expect(slider.value).toBe("120");
    expect(slider.min).toBe("50");
    expect(slider.max).toBe("200");
  });

  it("emits the next number on change", () => {
    const onChange = vi.fn();
    render(<Slider value={10} onChange={onChange} label="Zoom" min={0} max={100} />);
    fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), {
      target: { value: "60" },
    });
    expect(onChange).toHaveBeenCalledWith(60);
  });

  it("shows the value + unit readout when showValue is set", () => {
    render(<Slider value={75} onChange={() => {}} label="Scale" unit="%" showValue />);
    expect(screen.getByText("75%")).toBeTruthy();
  });
});
