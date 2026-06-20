// Adversarial — LENS: scope/workspace isolation; 018/022/023 cross-scope
// state-corruption class.
//
// REGRESSION LENS (sibling of isolation-01, distinct store): viewStore.setScope
// claims a single, "Cross-store, applied in one move" wholesale worktree
// switch (viewStore.ts:103-110). It must re-key useLensStore too.
//
// Lenses are MORE dangerous than pins for cross-scope bleed, by the source's
// own admission (lenses.ts:42-45): "Lenses are keyed by workspace + scope
// like every other client-side persistence surface (G5.d; finding
// lens-scope-key-018): lens choices embed scope-dependent vocabulary
// (feature tags), so cross-scope bleed is real, not theoretical."
//
// CONSEQUENCE guarded against: scope A has a saved lens carrying scope-A
// feature tags. The user switches to scope B via the documented setScope. The
// lens store must stop resolving scope A's saved lens, or a scope-A
// feature-tag filter could be applied on scope B's corpus and future saves
// could persist under the wrong scoped key.
//
// CONTRACT-CORRECT behavior asserted here: after the single documented
// cross-store worktree switch, the lens store must not still present the
// PREVIOUS scope's saved lenses as resolvable.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_CHOICES } from "../view/filters";
import { useLensStore } from "../view/lenses";
import { useViewStore } from "../view/viewStore";

describe("setScope must not leave the previous scope's saved lenses resolvable (018)", () => {
  beforeEach(() => {
    useViewStore.setState({ scope: "A" });
    useLensStore.setState({ workspace: "default", scope: "A", saved: [] });
  });

  afterEach(() => {
    useViewStore.setState({ scope: null });
    useLensStore.setState({ workspace: "default", scope: "default", saved: [] });
  });

  it("re-keys the lens store off scope A when the worktree switches to B", () => {
    // Scope A: snapshot a lens carrying scope-A vocabulary (a feature tag).
    useLensStore.getState().saveCurrent("A's view", {
      ...structuredClone(DEFAULT_CHOICES),
      featureTags: ["scope-a-only-feature"],
    });
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
    expect(useLensStore.getState().choicesFor("A's view")).toBeNull();
  });
});
