// Automated WCAG contrast check (finding 038): G7.d names AA as the
// floor; this test backs the claim with math over the S47 token palette.
// The hex values MIRROR styles.css @theme (the documented convention from
// the S47 record); if the tokens change, this test changes with them.

import { describe, expect, it } from "vitest";

function luminance(hex: number): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((hex >> 16) & 0xff) +
    0.7152 * channel((hex >> 8) & 0xff) +
    0.0722 * channel(hex & 0xff)
  );
}

export function contrastRatio(a: number, b: number): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT = {
  paper: 0xfaf9f7,
  ink: 0x2b2620,
  inkMuted: 0x6a6258,
  stateBroken: 0xb3502d,
  stateStale: 0xa07520,
  stateActive: 0x2f7d4f,
};

const DARK = {
  paper: 0x211e1a,
  ink: 0xe8e3da,
  inkMuted: 0xa39b8f,
  stateBroken: 0xd97352,
  stateStale: 0xd9a84e,
  stateActive: 0x5fb585,
};

describe("token palette contrast (G7.d AA floor)", () => {
  for (const [theme, t] of [
    ["light", LIGHT],
    ["dark", DARK],
  ] as const) {
    it(`${theme}: body text meets AA (≥4.5:1)`, () => {
      expect(contrastRatio(t.ink, t.paper)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.inkMuted, t.paper)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${theme}: state hues meet the graphics floor (≥3:1)`, () => {
      expect(contrastRatio(t.stateBroken, t.paper)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(t.stateStale, t.paper)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(t.stateActive, t.paper)).toBeGreaterThanOrEqual(3);
    });
  }
});
