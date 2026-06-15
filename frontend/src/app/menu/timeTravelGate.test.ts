// @vitest-environment happy-dom
//
// Cross-surface time-travel gate (W05.P12.S55): with the real per-surface
// resolvers registered (app/menus/registerAll), the registry pipeline REMOVES
// every action marked disabledInTimeTravel in time-travel mode, across surfaces -
// proving the gate is a property of the descriptor applied once, not re-derived
// per menu, so no historical-mode mutation can leak through any menu.

import { describe, expect, it } from "vitest";

import type { EntityDescriptor } from "../../platform/actions/entity";
import { resolveActions } from "../../platform/actions/registry";
import "../menus/registerAll";

const ids = (entity: EntityDescriptor, timeTravel: boolean) =>
  resolveActions(entity, { timeTravel }).map((a) => a.id);

describe("time-travel gate across surfaces", () => {
  const cases: { name: string; entity: EntityDescriptor; gated: string }[] = [
    {
      name: "graph node",
      entity: { kind: "node", id: "n1" },
      gated: "node:open-island",
    },
    {
      name: "worktree",
      entity: { kind: "worktree", id: "wt1", branch: "main" },
      gated: "worktree:switch-scope",
    },
    {
      name: "empty canvas",
      entity: { kind: "canvas", id: "canvas" },
      gated: "canvas:clear-working-set",
    },
  ];

  for (const { name, entity, gated } of cases) {
    it(`${name}: offers ${gated} live, removes it in time-travel`, () => {
      expect(ids(entity, false)).toContain(gated);
      expect(ids(entity, true)).not.toContain(gated);
    });
  }

  it("non-mutating actions survive time-travel (copy id stays on the node menu)", () => {
    expect(ids({ kind: "node", id: "n1" }, true)).toContain("node:copy-id");
  });
});
