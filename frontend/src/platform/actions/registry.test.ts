// Registry + descriptor units (W01.P01.S05): a resolver registered by entity
// kind is the only thing that produces a menu; an unregistered kind yields a
// quiet empty list; the disposer removes the resolver. The central time-travel
// gate is tested separately (W02.P06.S26).

import { afterEach, describe, expect, it } from "vitest";

import { isRunnable, type ActionDescriptor } from "./action";
import type { NodeEntity } from "./entity";
import {
  hasResolver,
  registerResolver,
  resetResolvers,
  resolveActions,
  type ActionContext,
} from "./registry";

const LIVE: ActionContext = { timeTravel: false };

afterEach(() => resetResolvers());

describe("resolver registry", () => {
  it("resolves a kind through its registered resolver", () => {
    registerResolver("node", (entity) => [
      { id: `focus:${entity.id}`, label: `focus ${entity.title ?? entity.id}` },
    ]);
    const entity: NodeEntity = { kind: "node", id: "n1", title: "Alpha" };
    const actions = resolveActions(entity, LIVE);
    expect(actions).toHaveLength(1);
    expect(actions[0].label).toBe("focus Alpha");
  });

  it("returns an empty list for an unregistered kind (quiet, not an error)", () => {
    expect(resolveActions({ kind: "canvas", id: "canvas" }, LIVE)).toEqual([]);
    expect(hasResolver("canvas")).toBe(false);
  });

  it("passes the action context through to the resolver", () => {
    let seen: ActionContext | null = null;
    registerResolver("node", (_e, ctx) => {
      seen = ctx;
      return [];
    });
    resolveActions({ kind: "node", id: "n1" }, { timeTravel: true });
    expect(seen).toEqual({ timeTravel: true });
  });

  it("the disposer removes the resolver", () => {
    const dispose = registerResolver("edge", () => [{ id: "x", label: "x" }]);
    expect(hasResolver("edge")).toBe(true);
    dispose();
    expect(hasResolver("edge")).toBe(false);
    expect(resolveActions({ kind: "edge", id: "e1" }, LIVE)).toEqual([]);
  });

  it("re-registering a kind replaces the prior resolver", () => {
    registerResolver("node", () => [{ id: "a", label: "first" }]);
    registerResolver("node", () => [{ id: "b", label: "second" }]);
    const actions = resolveActions({ kind: "node", id: "n1" }, LIVE);
    expect(actions.map((a) => a.label)).toEqual(["second"]);
  });
});

describe("time-travel gate (W02.P06.S26)", () => {
  it("removes disabledInTimeTravel actions in time-travel, keeps them live", () => {
    registerResolver("node", () => [
      { id: "focus", label: "Focus" },
      { id: "copy", label: "Copy id", section: "copy" },
      { id: "pin", label: "Pin", section: "transform", disabledInTimeTravel: true },
      { id: "remove", label: "Remove", section: "danger", disabledInTimeTravel: true },
    ]);
    const node = { kind: "node", id: "n1" } as const;
    expect(resolveActions(node, { timeTravel: false }).map((a) => a.id)).toEqual([
      "focus",
      "copy",
      "pin",
      "remove",
    ]);
    expect(resolveActions(node, { timeTravel: true }).map((a) => a.id)).toEqual([
      "focus",
      "copy",
    ]);
  });
});

describe("isRunnable", () => {
  const base: ActionDescriptor = { id: "i", label: "l" };
  it("is true for a run action", () => {
    expect(isRunnable({ ...base, run: () => {} })).toBe(true);
  });
  it("is true for a dispatch action", () => {
    expect(isRunnable({ ...base, dispatch: { type: "t" } })).toBe(true);
  });
  it("is false when disabled", () => {
    expect(isRunnable({ ...base, run: () => {}, disabled: true })).toBe(false);
  });
  it("is false for a bare placeholder", () => {
    expect(isRunnable(base)).toBe(false);
  });
});
