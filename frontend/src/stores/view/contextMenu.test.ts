// Menu open-state slice transitions (W01.P02.S08): single-instance open/close,
// arm/disarm, and the invariant that every dismiss clears the entity, anchor,
// and armed slot.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { EntityDescriptor } from "../../platform/actions/entity";
import { closeContextMenu, openContextMenu, useContextMenuStore } from "./contextMenu";

const NODE: EntityDescriptor = { kind: "node", id: "n1", title: "Alpha" };
const EDGE: EntityDescriptor = { kind: "edge", id: "e1" };

beforeEach(() => useContextMenuStore.getState().closeMenu());
afterEach(() => useContextMenuStore.getState().closeMenu());

describe("context-menu slice", () => {
  it("opens with the entity and anchor", () => {
    openContextMenu(NODE, { x: 10, y: 20 });
    const s = useContextMenuStore.getState();
    expect(s.open).toBe(true);
    expect(s.entity).toEqual(NODE);
    expect(s.anchor).toEqual({ x: 10, y: 20 });
  });

  it("is single-instance: a second open replaces the first and clears the arm", () => {
    openContextMenu(NODE, { x: 10, y: 20 });
    useContextMenuStore.getState().arm("focus:n1");
    expect(useContextMenuStore.getState().armedItemId).toBe("focus:n1");

    openContextMenu(EDGE, { x: 99, y: 5 });
    const s = useContextMenuStore.getState();
    expect(s.entity).toEqual(EDGE);
    expect(s.anchor).toEqual({ x: 99, y: 5 });
    expect(s.armedItemId).toBeNull();
  });

  it("close clears entity, anchor, and arm", () => {
    openContextMenu(NODE, { x: 10, y: 20 });
    useContextMenuStore.getState().arm("delete:n1");
    closeContextMenu();
    const s = useContextMenuStore.getState();
    expect(s.open).toBe(false);
    expect(s.entity).toBeNull();
    expect(s.anchor).toBeNull();
    expect(s.armedItemId).toBeNull();
  });

  it("arm then disarm without firing", () => {
    openContextMenu(NODE, { x: 0, y: 0 });
    useContextMenuStore.getState().arm("delete:n1");
    expect(useContextMenuStore.getState().armedItemId).toBe("delete:n1");
    useContextMenuStore.getState().disarm();
    expect(useContextMenuStore.getState().armedItemId).toBeNull();
    // The menu stays open after a disarm (only close() closes it).
    expect(useContextMenuStore.getState().open).toBe(true);
  });
});
