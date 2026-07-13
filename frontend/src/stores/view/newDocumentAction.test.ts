// The one new-document descriptor (authoring-surface ADR D5). Every visible create
// affordance — the workspace empty-state button, the browser-region Plus, the
// Features-section Plus, the context menus, the palette, and the chord — dispatches
// this SAME descriptor under the one shared id, whatever prefill/focus options it
// carries. This guards that convergence and the Features-section focus behaviour.

import { afterEach, describe, expect, it } from "vitest";

import { LEFT_RAIL_NEW_DOC_ACTION_ID, newDocumentAction } from "./leftRailKeybindings";
import { resetCreateDocChrome, useCreateDocChromeStore } from "./createDocChrome";

afterEach(() => resetCreateDocChrome());

describe("newDocumentAction identity", () => {
  it("carries the one shared id regardless of prefill/focus options", () => {
    expect(newDocumentAction().id).toBe(LEFT_RAIL_NEW_DOC_ACTION_ID);
    expect(newDocumentAction("some-feature").id).toBe(LEFT_RAIL_NEW_DOC_ACTION_ID);
    expect(newDocumentAction(undefined, { focusFeature: true }).id).toBe(
      LEFT_RAIL_NEW_DOC_ACTION_ID,
    );
  });

  it("the Features-section variant opens the dialog and requests feature focus", () => {
    expect(useCreateDocChromeStore.getState().open).toBe(false);
    newDocumentAction(undefined, { focusFeature: true }).run?.();
    const state = useCreateDocChromeStore.getState();
    expect(state.open).toBe(true);
    expect(state.focusFeatureField).toBe(true);
  });

  it("an ordinary open does not request feature focus", () => {
    newDocumentAction().run?.();
    expect(useCreateDocChromeStore.getState().focusFeatureField).toBe(false);
  });
});
