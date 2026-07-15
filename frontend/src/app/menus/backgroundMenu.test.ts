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
  it("returns the app-chrome escape hatches plus the graph + follow-mode toggles in order", () => {
    expect(
      backgroundMenu({ kind: "background", id: "bg", region: "left-rail" }).map(
        (a) => a.id,
      ),
    ).toEqual([
      "app:command-palette",
      "app:settings",
      "app:keyboard-shortcuts",
      "window:reset-layout",
      "window:graph",
      "view:follow-mode",
    ]);
  });

  it("prepends the timeline Filter-by date-criterion group only for the timeline region (Issue #14)", () => {
    const ids = backgroundMenu({
      kind: "background",
      id: "bg",
      region: "timeline",
    }).map((a) => a.id);
    // The criterion group is authored ahead of the universal tail, in vocabulary order.
    expect(ids.slice(0, 3)).toEqual([
      "timeline:filter-by:created",
      "timeline:filter-by:modified",
      "timeline:filter-by:stamped",
    ]);
    expect(ids).toContain("app:command-palette");
    // Created is the active/served criterion (current); the others are disabled-with-reason.
    const actions = backgroundMenu({
      kind: "background",
      id: "bg",
      region: "timeline",
    });
    expect(actions.find((a) => a.id === "timeline:filter-by:created")?.disabled).toBe(
      true,
    );
    expect(actions.find((a) => a.id === "timeline:filter-by:created")).toMatchObject({
      label: { key: "timeline:actions.filterByCreationDateCurrent" },
      disabledReason: { key: "timeline:disabledReasons.current" },
    });
    expect(actions.find((a) => a.id === "timeline:filter-by:modified")).toMatchObject({
      label: { key: "timeline:actions.filterByEditDate" },
      disabled: true,
      disabledReason: {
        key: "timeline:disabledReasons.modifiedUnavailable",
      },
    });
    // A non-timeline region carries no criterion group.
    expect(
      backgroundMenu({ kind: "background", id: "bg", region: "right-rail" }).map(
        (a) => a.id,
      ),
    ).not.toContain("timeline:filter-by:created");
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
