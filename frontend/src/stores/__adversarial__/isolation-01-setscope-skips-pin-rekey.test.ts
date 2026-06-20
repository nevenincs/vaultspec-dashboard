// Adversarial — LENS: scope/workspace isolation; the 018/022/023
// cross-scope state-corruption class.
//
// REGRESSION LENS: viewStore.setScope is documented as the single,
// cross-store, "wholesale" worktree switch. Its own source comment
// (viewStore.ts:103-110) states: "WHOLESALE swap ... everything scoped to
// the previous corpus resets ... The filter model resets too ...
// Cross-store, applied in one move." It must reach across scoped sibling
// stores too.
//
// But pins persist client-side PER workspace+scope (pins.ts:1-5, ADR G5.d,
// finding-018). setScope must re-key usePinStore; clearing other view-store
// pin-like concepts is not enough because layout pins have their own scoped
// persistence key.
//
// CONSEQUENCE guarded against (the 018/022/023 class, exactly): scope A is active, the user
// pins node "a:pinned", then switches to scope B via setScope. The pin
// store must not still report scope "A" or "a:pinned" as active, or scope A's
// pins would be shown on scope B's stage and the next togglePin would persist
// under the wrong scoped key.
//
// CONTRACT-CORRECT behavior asserted here: after the documented single
// cross-store worktree switch (setScope), the pin store must no longer
// present the PREVIOUS scope's pins as the active set.

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
