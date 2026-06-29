import { beforeEach, describe, expect, it } from "vitest";

import {
  closeProjectNavigator,
  openProjectNavigator,
  useProjectNavigatorChromeStore,
} from "./projectNavigatorChrome";

describe("project navigator chrome", () => {
  beforeEach(() => closeProjectNavigator());

  it("opens (idempotently), toggles, and closes the popup disclosure", () => {
    expect(useProjectNavigatorChromeStore.getState().open).toBe(false);

    openProjectNavigator();
    expect(useProjectNavigatorChromeStore.getState().open).toBe(true);
    // Idempotent-open: a second open never closes an already-open popup.
    openProjectNavigator();
    expect(useProjectNavigatorChromeStore.getState().open).toBe(true);

    closeProjectNavigator();
    expect(useProjectNavigatorChromeStore.getState().open).toBe(false);

    useProjectNavigatorChromeStore.getState().toggleOpen();
    expect(useProjectNavigatorChromeStore.getState().open).toBe(true);
    useProjectNavigatorChromeStore.getState().toggleOpen();
    expect(useProjectNavigatorChromeStore.getState().open).toBe(false);
  });

  it("coerces a non-boolean setOpen to false (defensive boundary)", () => {
    useProjectNavigatorChromeStore.getState().setOpen("yes" as unknown as boolean);
    expect(useProjectNavigatorChromeStore.getState().open).toBe(false);
  });
});
