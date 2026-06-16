// @vitest-environment happy-dom
//
// Kbd kit primitive (W01.P02.S05): renders the semantic <kbd> keycap without
// crashing and shows its key text.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Kbd } from "./Kbd";

afterEach(cleanup);

describe("Kbd", () => {
  it("renders a <kbd> element with its key text", () => {
    render(<Kbd>K</Kbd>);
    const cap = screen.getByText("K");
    expect(cap.tagName.toLowerCase()).toBe("kbd");
  });

  it("carries the mono type role", () => {
    render(<Kbd>Esc</Kbd>);
    expect(screen.getByText("Esc").className).toContain("text-mono");
  });
});
