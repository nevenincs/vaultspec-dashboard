// @vitest-environment happy-dom
//
// Cross-layer token-read verification (W01.P02.S10). The scene's
// getComputedStyle readers parse the public --color-* surface as #rrggbb. This
// test sets the rebuilt token layer's LITERAL HEX values (the scene-read
// subset emitted by the OKLCH token file) on documentElement and asserts the
// readers resolve them - proving the seam against the new token values, not
// just the hardcoded fallbacks the node-env unit tests exercise.
//
// The hex values here are the exact light-theme renderings the token file
// emits for the scene-read surface; they are the contract the readers depend
// on. If the token file's scene-read hex changes, this test must change with
// it - that coupling is the point: it pins mock-vs-live token fidelity.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { groupColor } from "./edgeStyle";
import { stateColor } from "./nodeVisualEncoding";
import { cssColorNumber } from "./tokenReads";

// Node-category scene-read hex (Figma-canonical, light theme). These drive the
// headline graph node-category colouring and are emitted as LITERAL HEX per
// theme so the getComputedStyle readers resolve them (HIGH-1 contract).
const CATEGORY_TOKENS: Record<string, string> = {
  "--color-scene-category-feature": "#b3823c",
  "--color-scene-category-research": "#4f7a9e",
  "--color-scene-category-adr": "#8a72b5",
  "--color-scene-category-plan": "#3f8457",
  "--color-scene-category-exec": "#b5703f",
  "--color-scene-category-audit": "#3f9aa6",
  "--color-scene-category-index": "#8f9a7e",
  "--color-scene-category-code": "#b05a6b",
};

// The scene-read surface, light theme (matches styles.css @theme static 3b).
const SCENE_TOKENS: Record<string, string> = {
  "--color-canvas-bg": "#fdfaf6",
  "--color-ink": "#312d27",
  "--color-ink-muted": "#5f5a53",
  "--color-rule": "#ebe6e0",
  // The uniform grey edge stroke (Hero redesign) — every tier resolves to this.
  "--color-scene-rule": "#d8d2ca",
  "--color-tier-declared": "#312d27",
  "--color-tier-structural": "#3f774d",
  "--color-tier-temporal": "#5c5040",
  "--color-tier-semantic": "#8b85b7",
  "--color-state-active": "#3f774d",
  "--color-state-complete": "#5c5040",
  "--color-state-archived": "#898581",
  "--color-state-stale": "#9f7100",
  "--color-state-broken": "#ae4024",
  // status-stamp reinforcement tints (node-visual-richness P03), light theme.
  "--color-status-provisional": "#806a44",
  "--color-status-graded": "#9f7100",
  "--color-status-tiered": "#5c5040",
};

// Dark theme scene-read hex (matches styles.css [data-theme=dark] block 3b).
// state-complete and state-archived are included: they are the HIGH-1 regression
// surface - the reader parses only hex, so an oklch() value would fall through
// to the hardcoded light fallback (a `complete` node was 1.79:1 on dark canvas).
const DARK_TOKENS: Record<string, string> = {
  "--color-canvas-bg": "#1a1713",
  "--color-ink-muted": "#a9a49c",
  "--color-scene-rule": "#3a352e",
  "--color-state-active": "#5d9d6b",
  "--color-state-complete": "#bdaf9d",
  "--color-state-archived": "#74716c",
  "--color-state-broken": "#e37f65",
  "--color-tier-structural": "#5d9d6b",
};

function applyTokens(tokens: Record<string, string>): void {
  for (const [name, value] of Object.entries(tokens)) {
    document.documentElement.style.setProperty(name, value);
  }
}

const hexToNum = (h: string) => parseInt(h.slice(1), 16);

describe("scene getComputedStyle reads resolve from the rebuilt token layer (S10)", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
  });
  afterEach(() => {
    document.documentElement.removeAttribute("style");
  });

  it("edgeMeshes.groupColor reads the uniform scene-rule grey for EVERY tier", () => {
    applyTokens(SCENE_TOKENS);
    // The Hero redesign flattened the edge stroke: every group key resolves to
    // the single --color-scene-rule grey, not a per-tier/state hue.
    const grey = hexToNum("#d8d2ca");
    expect(groupColor("declared")).toBe(grey);
    expect(groupColor("structural:resolved")).toBe(grey);
    expect(groupColor("structural:broken")).toBe(grey);
    expect(groupColor("temporal:3")).toBe(grey);
    expect(groupColor("semantic:0")).toBe(grey);
    expect(groupColor("meta")).toBe(grey);
  });

  it("nodeSprites.stateColor reads ALL FIVE lifecycle states as hex (HIGH-1)", () => {
    applyTokens(SCENE_TOKENS);
    expect(stateColor({ state: "active" } as never)).toBe(hexToNum("#3f774d"));
    // complete + archived are the HIGH-1 surface: they must be real hex, never
    // an oklch() that silently falls through to the light-mode fallback.
    expect(stateColor({ state: "complete" } as never)).toBe(hexToNum("#5c5040"));
    expect(stateColor({ state: "archived" } as never)).toBe(hexToNum("#898581"));
    expect(stateColor({ state: "broken" } as never)).toBe(hexToNum("#ae4024"));
    expect(stateColor({ state: "stale" } as never)).toBe(hexToNum("#9f7100"));
    // missing lifecycle falls back to ink-muted, read from the token layer.
    expect(stateColor(undefined)).toBe(hexToNum("#5f5a53"));
  });

  // (The canvas status-stamp tint reader `stampColor` was retired with the
  // on-canvas stamps in the Hero redesign; the status tint now lives only in the
  // hover-card, exercised by the HoverCard render tests + statusStamp.test.ts.)

  it("cssColorNumber resolves each scene-read node-category token as literal hex", () => {
    applyTokens(CATEGORY_TOKENS);
    for (const [name, hex] of Object.entries(CATEGORY_TOKENS)) {
      // The scene reader parses these #rrggbb tokens directly (the fast path);
      // an UNRESOLVABLE value would fall through. -1 fallback proves a hex read.
      expect(cssColorNumber(name, -1)).toBe(hexToNum(hex));
    }
  });

  it("parses a resolved oklch() value (the aliased chrome-token case), not just hex", () => {
    // getComputedStyle flattens a chrome token like --color-accent to its oklch()
    // accent semantic; the reader must parse that, not fall back to the light hex
    // (the dark/HC ring bug). hue 150 → a green, so the green channel dominates.
    document.documentElement.style.setProperty("--color-accent", "oklch(0.7 0.09 150)");
    const n = cssColorNumber("--color-accent", 0x8a7d5a);
    expect(n).not.toBe(0x8a7d5a); // NOT the light fallback
    const r = (n >> 16) & 0xff;
    const g = (n >> 8) & 0xff;
    const b = n & 0xff;
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it("also parses an rgb() resolved value", () => {
    document.documentElement.style.setProperty("--probe", "rgb(10, 20, 30)");
    expect(cssColorNumber("--probe", -1)).toBe((10 << 16) | (20 << 8) | 30);
  });

  it("falls back on an unresolvable value (self-cycle var / garbage / absent)", () => {
    document.documentElement.style.setProperty("--probe", "var(--missing)");
    expect(cssColorNumber("--probe", 0x123456)).toBe(0x123456);
    document.documentElement.style.setProperty("--probe", "not-a-color");
    expect(cssColorNumber("--probe", 0x123456)).toBe(0x123456);
    expect(cssColorNumber("--never-set", 0x123456)).toBe(0x123456);
  });

  it("re-resolves the dark theme hex when the token layer flips", () => {
    applyTokens(SCENE_TOKENS);
    expect(stateColor({ state: "active" } as never)).toBe(hexToNum("#3f774d"));
    // A [data-theme=dark] flip overrides the custom properties; the reader,
    // which calls getComputedStyle on every read, picks up the new hex.
    applyTokens(DARK_TOKENS);
    expect(stateColor({ state: "active" } as never)).toBe(hexToNum("#5d9d6b"));
    // The edge grey re-resolves to the dark scene-rule hex on the theme flip.
    expect(groupColor("structural:broken")).toBe(hexToNum("#3a352e"));
  });

  it("complete + archived resolve to the DARK hex after a theme flip (HIGH-1)", () => {
    applyTokens(SCENE_TOKENS);
    // light: complete = temporal warm-brown, archived = warm gray.
    expect(stateColor({ state: "complete" } as never)).toBe(hexToNum("#5c5040"));
    expect(stateColor({ state: "archived" } as never)).toBe(hexToNum("#898581"));
    // After a dark flip the reader must pick up the dark hex, NOT the light
    // fallback (the exact bug HIGH-1 catches: a dark `complete` node was
    // #4a4137 on #1a1713 = 1.79:1, effectively invisible).
    applyTokens(DARK_TOKENS);
    expect(stateColor({ state: "complete" } as never)).toBe(hexToNum("#bdaf9d"));
    expect(stateColor({ state: "archived" } as never)).toBe(hexToNum("#74716c"));
  });
});
