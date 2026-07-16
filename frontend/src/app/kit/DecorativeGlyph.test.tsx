// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DecorativeGlyph, type DecorativeGlyphName } from "./DecorativeGlyph";

afterEach(cleanup);

describe("DecorativeGlyph", () => {
  it("owns the complete decorative symbol vocabulary as hidden semantics", () => {
    const names: DecorativeGlyphName[] = [
      "arrowDown",
      "arrowRight",
      "arrowUp",
      "complete",
      "enter",
      "incomplete",
      "middleDot",
      "minus",
      "plus",
      "slash",
    ];
    const { container } = render(
      <div aria-label="Localized surrounding control">
        {names.map((name) => (
          <DecorativeGlyph key={name} name={name} />
        ))}
      </div>,
    );
    const glyphs = container.querySelectorAll("[data-decorative-glyph]");
    expect(glyphs).toHaveLength(names.length);
    for (const glyph of glyphs) expect(glyph.getAttribute("aria-hidden")).toBe("true");
  });
});
