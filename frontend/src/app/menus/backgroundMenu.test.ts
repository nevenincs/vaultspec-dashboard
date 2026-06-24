// Background context menu (background-context-menus P01.S06): the `background` entity
// normalizes (id + optional region), and the resolver contributes the four app-chrome
// escape hatches with reset-layout time-travel gated.

import { afterEach, describe, expect, it } from "vitest";

import { normalizeEntityDescriptor } from "../../platform/actions/entity";
import { resetResolvers } from "../../platform/actions/registry";
import { backgroundMenu } from "./backgroundMenu";

afterEach(() => resetResolvers());

describe("background entity normalizer", () => {
  it("normalizes a background entity with a valid region", () => {
    expect(
      normalizeEntityDescriptor({
        kind: "background",
        id: "bg",
        region: " left-rail ",
      }),
    ).toEqual({ kind: "background", id: "bg", region: "left-rail" });
  });

  it("drops an unknown region but keeps the entity", () => {
    expect(
      normalizeEntityDescriptor({ kind: "background", id: "bg", region: "nope" }),
    ).toEqual({ kind: "background", id: "bg" });
  });

  it("requires a non-empty id", () => {
    expect(normalizeEntityDescriptor({ kind: "background", id: "   " })).toBeNull();
  });
});

describe("backgroundMenu resolver", () => {
  it("returns the four app-chrome escape hatches in order", () => {
    expect(
      backgroundMenu({ kind: "background", id: "bg", region: "left-rail" }).map(
        (a) => a.id,
      ),
    ).toEqual([
      "app:command-palette",
      "app:settings",
      "app:keyboard-shortcuts",
      "window:reset-layout",
    ]);
  });

  it("time-travel gates reset-layout (a layout mutation), not the navigations", () => {
    const actions = backgroundMenu({ kind: "background", id: "bg" });
    const reset = actions.find((a) => a.id === "window:reset-layout");
    expect(reset?.disabledInTimeTravel).toBe(true);
    expect(
      actions.find((a) => a.id === "app:settings")?.disabledInTimeTravel,
    ).toBeUndefined();
  });

  it("returns nothing for a non-background entity", () => {
    expect(backgroundMenu({ kind: "canvas", id: "canvas" })).toEqual([]);
  });
});
