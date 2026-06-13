// Adversarial — LENS: scope/workspace isolation; 018/022/023 cross-scope
// state-corruption class.
//
// SUSPECT (sibling of isolation-01, distinct store): viewStore.setScope
// claims a single, "Cross-store, applied in one move" wholesale worktree
// switch (viewStore.ts:103-110) and reaches into useFilterStore.reset().
// But it never re-keys useLensStore either.
//
// Lenses are MORE dangerous than pins for cross-scope bleed, by the source's
// own admission (lenses.ts:42-45): "Lenses are keyed by workspace + scope
// like every other client-side persistence surface (G5.d; finding
// lens-scope-key-018): lens choices embed scope-dependent vocabulary
// (feature tags), so cross-scope bleed is real, not theoretical."
//
// CONSEQUENCE: scope A has a saved lens carrying scope-A feature tags. The
// user switches to scope B via the documented setScope. The lens store
// still serves scope A's saved lens (useLensStore.all() / .apply() still
// resolve it), so a scope-A feature-tag filter is applied on scope B's
// corpus. And the next saveCurrent/remove persists under whatever scope the
// lens store still holds (lenses.ts:133/147 read get().scope) — writing
// scope A's vocabulary under a stale key. That is the lens-scope-key-018
// corruption the per-scope keying exists to prevent.
//
// CONTRACT-CORRECT behavior asserted here: after the single documented
// cross-store worktree switch, the lens store must not still present the
// PREVIOUS scope's saved lenses as resolvable. Red because setScope leaves
// useLensStore untouched.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useFilterStore } from "../view/filters";
import { useLensStore } from "../view/lenses";
import { useViewStore } from "../view/viewStore";

describe("setScope must not leave the previous scope's saved lenses resolvable (018)", () => {
  beforeEach(() => {
    useFilterStore.getState().reset();
    useViewStore.setState({ scope: "A" });
    useLensStore.setState({ workspace: "default", scope: "A", saved: [] });
  });

  afterEach(() => {
    useFilterStore.getState().reset();
    useViewStore.setState({ scope: null });
    useLensStore.setState({ workspace: "default", scope: "default", saved: [] });
  });

  it("re-keys the lens store off scope A when the worktree switches to B", () => {
    // Scope A: snapshot a lens carrying scope-A vocabulary (a feature tag).
    useFilterStore.getState().setFacet("featureTags", ["scope-a-only-feature"]);
    useLensStore.getState().saveCurrent("A's view");
    expect(useLensStore.getState().scope).toBe("A");
    expect(
      useLensStore
        .getState()
        .all()
        .map((l) => l.name),
    ).toContain("A's view");

    // The single, documented, cross-store worktree switch to scope B.
    useViewStore.getState().setScope("B");
    expect(useViewStore.getState().scope).toBe("B");

    // Scope B's lens palette must NOT resolve scope A's saved lens — its
    // feature-tag vocabulary belongs to a different corpus. CONTRACT: no
    // cross-scope lens bleed.
    expect(useLensStore.getState().scope).not.toBe("A");
    expect(
      useLensStore
        .getState()
        .all()
        .map((l) => l.name),
    ).not.toContain("A's view");
    expect(useLensStore.getState().apply("A's view")).toBe(false);
  });
});
