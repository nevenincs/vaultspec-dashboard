import type { ReactElement } from "react";

const DECORATIVE_GLYPHS = Object.freeze({
  arrowDown: "↓",
  arrowRight: "→",
  arrowUp: "↑",
  complete: "✓",
  enter: "↵",
  incomplete: "○",
  middleDot: "·",
  minus: "−",
  plus: "+",
  slash: "/",
});

export type DecorativeGlyphName = keyof typeof DECORATIVE_GLYPHS;

export function DecorativeGlyph({
  name,
  className,
}: {
  readonly name: DecorativeGlyphName;
  readonly className?: string;
}): ReactElement {
  return (
    <span aria-hidden="true" className={className} data-decorative-glyph={name}>
      {DECORATIVE_GLYPHS[name]}
    </span>
  );
}
