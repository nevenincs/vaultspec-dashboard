// Graph stage context-menu resolvers (W04.P11.S52): each resolver is a pure
// function of its entity descriptor, tested directly. Covers the canonical node
// resolver (shared with the inspector), meta-edge, island, and empty-canvas.

import { describe, expect, it } from "vitest";

import type {
  IslandEntity,
  MetaEdgeEntity,
  NodeEntity,
} from "../../../platform/actions/entity";
import { islandMenu } from "../../islands/menus/islandMenu";
import { canvasMenu } from "./canvasMenu";
import { graphNodeMenu } from "./graphNodeMenu";
import { metaEdgeMenu } from "./metaEdgeMenu";

const byId = (actions: { id: string }[]) => actions.map((a) => a.id);
const find = <T extends { id: string }>(actions: T[], id: string): T => {
  const found = actions.find((a) => a.id === id);
  if (!found) throw new Error(`no action ${id} in [${byId(actions).join(", ")}]`);
  return found;
};

describe("graphNodeMenu (canonical node resolver)", () => {
  const base: NodeEntity = { kind: "node", id: "doc:alpha", title: "Alpha" };

  it("offers focus / open-island / pin / expand-ego / copies by default", () => {
    expect(byId(graphNodeMenu(base))).toEqual([
      "node:focus",
      "node:open-island",
      "node:pin",
      "node:expand-ego",
      "node:copy-id",
      "node:copy-title",
    ]);
  });

  it("toggles to close-island / unpin / collapse-ego from membership flags", () => {
    const open = byId(
      graphNodeMenu({ ...base, isOpen: true, isPinned: true, inWorkingSet: true }),
    );
    expect(open).toContain("node:close-island");
    expect(open).not.toContain("node:open-island");
    expect(open).toContain("node:unpin");
    expect(open).toContain("node:collapse-ego");
  });

  it("gates every view-mutating action in time-travel; leaves focus/copy free", () => {
    const a = graphNodeMenu(base);
    expect(find(a, "node:open-island").disabledInTimeTravel).toBe(true);
    expect(find(a, "node:pin").disabledInTimeTravel).toBe(true);
    expect(find(a, "node:expand-ego").disabledInTimeTravel).toBe(true);
    expect(find(a, "node:focus").disabledInTimeTravel).toBeUndefined();
    expect(find(a, "node:copy-id").disabledInTimeTravel).toBeUndefined();
  });

  it("disables copy-title with a reason when there is no title", () => {
    const copyTitle = find(
      graphNodeMenu({ kind: "node", id: "n1" }),
      "node:copy-title",
    );
    expect(copyTitle.disabled).toBe(true);
    expect(copyTitle.disabledReason).toBe("no title");
  });
});

describe("metaEdgeMenu", () => {
  it("copies the summary when present, plus the id", () => {
    const e: MetaEdgeEntity = { kind: "meta-edge", id: "m1", summary: "3 structural" };
    expect(byId(metaEdgeMenu(e))).toEqual([
      "meta-edge:copy-summary",
      "meta-edge:copy-id",
    ]);
    expect(find(metaEdgeMenu(e), "meta-edge:copy-summary").disabled).toBeUndefined();
  });

  it("disables copy-summary with a reason when absent", () => {
    const e: MetaEdgeEntity = { kind: "meta-edge", id: "m1" };
    const summary = find(metaEdgeMenu(e), "meta-edge:copy-summary");
    expect(summary.disabled).toBe(true);
    expect(summary.disabledReason).toBe("no summary");
  });
});

describe("islandMenu", () => {
  it("offers focus / close / copy-id; close is gated in time-travel", () => {
    const e: IslandEntity = { kind: "island", id: "doc:alpha" };
    expect(byId(islandMenu(e))).toEqual([
      "island:focus",
      "island:close",
      "island:copy-id",
    ]);
    expect(find(islandMenu(e), "island:close").disabledInTimeTravel).toBe(true);
    expect(find(islandMenu(e), "island:focus").disabledInTimeTravel).toBeUndefined();
  });
});

describe("canvasMenu", () => {
  it("offers fit / reset / toggle-layout / clear-working-set", () => {
    expect(byId(canvasMenu())).toEqual([
      "canvas:fit",
      "canvas:reset",
      "canvas:toggle-layout",
      "canvas:clear-working-set",
    ]);
  });

  it("gates only clear-working-set in time-travel; camera/layout are free", () => {
    const a = canvasMenu();
    expect(find(a, "canvas:clear-working-set").disabledInTimeTravel).toBe(true);
    expect(find(a, "canvas:fit").disabledInTimeTravel).toBeUndefined();
    expect(find(a, "canvas:reset").disabledInTimeTravel).toBeUndefined();
    expect(find(a, "canvas:toggle-layout").disabledInTimeTravel).toBeUndefined();
  });
});
