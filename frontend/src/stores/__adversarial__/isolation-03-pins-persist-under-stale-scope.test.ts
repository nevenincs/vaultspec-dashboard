// Adversarial — LENS: scope/workspace isolation; 018/022/023 cross-scope
// state-corruption class. This closes the loop on the PERSISTED half of the
// bleed (the prompt's "scope A pins persisted under scope B").
//
// REGRESSION LENS: After viewStore.setScope("B") the pin store must be
// re-keyed (proven structurally in isolation-01) before togglePin persists
// with exactly the store's current workspace/scope and current pinnedIds:
//
//     togglePin (pins.ts:73-81):
//       const { pinnedIds, workspace, scope } = get();
//       const next = ...;                       // A's pins +/- one
//       savePins(store, workspace, scope, next) // <- key from STALE scope
//
// Without that re-key, the first pin toggle after a switch-to-B would write
// A's stale pin set under whatever scope key the store still holds. This test
// reproduces the persistence path that togglePin runs and asserts the live
// post-setScope store points at B before the save.
//
// We use the injectable savePins/loadPins with a Map-backed KeyValueStore
// (the node test env has no localStorage). The pin set fed to savePins is
// taken from the live store AFTER setScope — not hand-built — so the
// corruption is the store's actual state, not a fabricated input.
//
// CONTRACT-CORRECT behavior asserted: after the documented worktree switch
// to B, the active persistence scope the store would write under must be B,
// and a persist of the store's current pins must NOT land scope A's pins
// under scope A's key as the "active" write while the user is on B.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { KeyValueStore } from "../../scene/positionCache";
import { loadPins, savePins, usePinStore } from "../view/pins";
import { useViewStore } from "../view/viewStore";

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

describe("a pin toggle after switching to scope B must persist under B, not A (018/023)", () => {
  beforeEach(() => {
    useViewStore.setState({ scope: "A" });
    usePinStore.setState({ pinnedIds: ["a:pinned"], workspace: "default", scope: "A" });
  });

  afterEach(() => {
    useViewStore.setState({ scope: null });
    usePinStore.setState({ pinnedIds: [], workspace: "default", scope: "default" });
  });

  it("does not write scope A's pins under the active scope after a B switch", () => {
    const store = new MemoryStore();

    // The user switches worktree A -> B through the documented single action.
    useViewStore.getState().setScope("B");
    expect(useViewStore.getState().scope).toBe("B");

    // Now the user pins a B node. Reproduce EXACTLY what togglePin persists:
    // it reads workspace/scope/pinnedIds straight from the re-keyed pin
    // store and saves them. We do not fabricate the pin set — it is the
    // store's live state after the switch.
    const { workspace, scope, pinnedIds } = usePinStore.getState();
    const next = [...pinnedIds, "b:new"];
    savePins(store, workspace, scope, next);

    // CONTRACT: the user is on scope B, so the active persisted set is B's.
    // Scope B's blob must hold ONLY B's pins; scope A's blob must remain
    // untouched (it was persisted earlier under A and must not absorb new
    // mutations made while the user is on B).
    expect(loadPins(store, "default", "B")).toEqual(["b:new"]);
    // And A's pinned node must NOT have ridden into the active write.
    expect(loadPins(store, "default", "B")).not.toContain("a:pinned");
  });
});
