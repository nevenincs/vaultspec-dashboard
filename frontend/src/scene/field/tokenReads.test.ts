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

import { groupColor } from "./edgeMeshes";
import { stateColor } from "./nodeSprites";

// The scene-read surface, light theme (matches styles.css @theme static 3b).
const SCENE_TOKENS: Record<string, string> = {
  "--color-canvas-bg": "#fdfaf6",
  "--color-ink": "#312d27",
  "--color-ink-muted": "#5f5a53",
  "--color-rule": "#ebe6e0",
  "--color-tier-declared": "#312d27",
  "--color-tier-structural": "#3f774d",
  "--color-tier-temporal": "#5c5040",
  "--color-tier-semantic": "#7f79a8",
  "--color-state-active": "#3f774d",
  "--color-state-stale": "#9f7100",
  "--color-state-broken": "#ae4024",
};

const DARK_TOKENS: Record<string, string> = {
  "--color-canvas-bg": "#1a1713",
  "--color-state-active": "#78b685",
  "--color-state-broken": "#e37f65",
  "--color-tier-structural": "#78b685",
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

  it("edgeMeshes.groupColor reads tier/state hex from the token layer", () => {
    applyTokens(SCENE_TOKENS);
    // declared edge resolves to the declared tier token verbatim.
    expect(groupColor("declared")).toBe(hexToNum("#312d27"));
    // structural:resolved edge resolves to state-active.
    expect(groupColor("structural:resolved")).toBe(hexToNum("#3f774d"));
    // structural:broken edge resolves to state-broken.
    expect(groupColor("structural:broken")).toBe(hexToNum("#ae4024"));
  });

  it("nodeSprites.stateColor reads state hex from the token layer", () => {
    applyTokens(SCENE_TOKENS);
    expect(stateColor({ state: "active" } as never)).toBe(hexToNum("#3f774d"));
    expect(stateColor({ state: "broken" } as never)).toBe(hexToNum("#ae4024"));
    expect(stateColor({ state: "stale" } as never)).toBe(hexToNum("#9f7100"));
    // missing lifecycle falls back to ink-muted, read from the token layer.
    expect(stateColor(undefined)).toBe(hexToNum("#5f5a53"));
  });

  it("re-resolves the dark theme hex when the token layer flips", () => {
    applyTokens(SCENE_TOKENS);
    expect(stateColor({ state: "active" } as never)).toBe(hexToNum("#3f774d"));
    // A [data-theme=dark] flip overrides the custom properties; the reader,
    // which calls getComputedStyle on every read, picks up the new hex.
    applyTokens(DARK_TOKENS);
    expect(stateColor({ state: "active" } as never)).toBe(hexToNum("#78b685"));
    expect(groupColor("structural:broken")).toBe(hexToNum("#e37f65"));
  });
});
