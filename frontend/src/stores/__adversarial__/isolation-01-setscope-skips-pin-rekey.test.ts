// Adversarial — LENS: scope/workspace isolation; the 018/022/023
// cross-scope state-corruption class.
//
// SUSPECT (PRIME): viewStore.setScope is documented as the single,
// cross-store, "wholesale" worktree switch. Its own source comment
// (viewStore.ts:103-110) states: "WHOLESALE swap ... everything scoped to
// the previous corpus resets ... The filter model resets too ...
// Cross-store, applied in one move." And it DOES reach across stores — it
// calls useFilterStore.getState().reset().
//
// But pins persist client-side PER workspace+scope (pins.ts:1-5, ADR G5.d,
// finding-018). setScope never re-keys usePinStore. The ONLY thing that
// re-keys pins is Stage.tsx's React effect on the *derived* active scope —
// not the store action that the contract comment claims applies the reset
// "in one move".
//
// CONSEQUENCE (the 018/022/023 class, exactly): scope A is active, the user
// pins node "a:pinned", then switches to scope B via setScope. The pin
// store STILL reports scope "A" and STILL reports "a:pinned" as pinned — so
// scope A's pins are shown on scope B's stage (set-pinned membership flows
// from usePinStore.pinnedIds, pins.ts:97). Worse, the next togglePin under
// B will persist A's stale pins MERGED with B's new pin under B's storage
// key (togglePin reads workspace/scope from the store, pins.ts:74) — the
// cross-scope corruption the per-scope keying exists to prevent.
//
// CONTRACT-CORRECT behavior asserted here: after the documented single
// cross-store worktree switch (setScope), the pin store must no longer
// present the PREVIOUS scope's pins as the active set. This test fails
// (red) because setScope leaves usePinStore untouched.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { usePinStore } from "../view/pins";
import { useViewStore } from "../view/viewStore";

describe("setScope must not leave the previous scope's pins active (018/022/023)", () => {
  beforeEach(() => {
    // Start clean: view store at scope A, pin store keyed to scope A.
    useViewStore.setState({ scope: "A" });
    usePinStore.setState({
      pinnedIds: [],
      workspace: "default",
      scope: "A",
    });
  });

  afterEach(() => {
    useViewStore.setState({ scope: null });
    usePinStore.setState({ pinnedIds: [], workspace: "default", scope: "default" });
  });

  it("re-keys the pin store off scope A when the worktree switches to B", () => {
    // Scope A: the user pins a node. The pin store records it under scope A.
    usePinStore.getState().togglePin("a:pinned");
    expect(usePinStore.getState().pinnedIds).toEqual(["a:pinned"]);
    expect(usePinStore.getState().scope).toBe("A");

    // The single, documented, cross-store worktree switch to scope B.
    useViewStore.getState().setScope("B");

    // The view store DID swap wholesale...
    expect(useViewStore.getState().scope).toBe("B");

    // ...but the pin store must not still be presenting scope A's pins as
    // the active membership on scope B's stage. Either the active scope key
    // re-keyed to B, or (at minimum) scope A's pins are no longer reported
    // as pinned. CONTRACT: no cross-scope bleed.
    expect(usePinStore.getState().scope).not.toBe("A");
    expect(usePinStore.getState().isPinned("a:pinned")).toBe(false);
  });
});
