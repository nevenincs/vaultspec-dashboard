// Menu open-state slice transitions (W01.P02.S08): single-instance open/close,
// arm/disarm, and the invariant that every dismiss clears the entity, anchor,
// and armed slot.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ACTION_DESCRIPTOR_ID_MAX_CHARS } from "../../platform/actions/action";
import { registerResolver, resetResolvers } from "../../platform/actions/registry";
import type { EntityDescriptor } from "../../platform/actions/entity";
import {
  armContextMenuItem,
  closeContextMenu,
  contextMenuActionLabel,
  contextMenuActionRowClassName,
  deriveContextMenuActivation,
  deriveContextMenuCursorEdge,
  deriveContextMenuCursorMove,
  deriveContextMenuPanelPosition,
  deriveContextMenuCursorRepair,
  deriveContextMenuResolvedView,
  disarmContextMenu,
  groupContextMenuActions,
  normalizeContextMenuAnchor,
  normalizeContextMenuCursor,
  normalizeContextMenuEntity,
  normalizeContextMenuItemId,
  normalizeContextMenuPanelSize,
  normalizeContextMenuTimeTravel,
  normalizeContextMenuViewport,
  openContextMenu,
  resetContextMenu,
  setContextMenuCursor,
  setContextMenuPosition,
  useContextMenuStore,
} from "./contextMenu";

const NODE: EntityDescriptor = { kind: "node", id: "n1", title: "Alpha" };
const EDGE: EntityDescriptor = { kind: "edge", id: "e1" };
const noop = () => undefined;
const VIEWPORT = { width: 1000, height: 800 };
const MENU_SIZE = { width: 200, height: 300 };

beforeEach(() => {
  resetResolvers();
  useContextMenuStore.getState().closeMenu();
});
afterEach(() => {
  resetResolvers();
  useContextMenuStore.getState().closeMenu();
});

describe("context-menu slice", () => {
  it("normalizes context-menu ingress values at the singleton store seam", () => {
    expect(normalizeContextMenuAnchor({ x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
    });
    expect(normalizeContextMenuAnchor({ x: Number.NaN, y: 20 })).toBeNull();
    expect(normalizeContextMenuCursor(2.8)).toBe(2);
    expect(normalizeContextMenuCursor(-1)).toBe(0);
    expect(normalizeContextMenuItemId(" delete:n1 ")).toBe("delete:n1");
    expect(
      normalizeContextMenuItemId("x".repeat(ACTION_DESCRIPTOR_ID_MAX_CHARS + 1)),
    ).toBeNull();
    expect(normalizeContextMenuItemId("   ")).toBeNull();
    expect(normalizeContextMenuPanelSize({ width: 200, height: 300 })).toEqual({
      width: 200,
      height: 300,
    });
    expect(normalizeContextMenuPanelSize({ width: -1, height: 300 })).toBeNull();
    expect(normalizeContextMenuViewport({ width: 1000, height: 800 })).toEqual({
      width: 1000,
      height: 800,
    });
    expect(normalizeContextMenuViewport({ width: 0, height: 800 })).toBeNull();
    expect(normalizeContextMenuTimeTravel(true)).toBe(true);
    expect(normalizeContextMenuTimeTravel(false)).toBe(false);
    expect(normalizeContextMenuTimeTravel("true")).toBe(false);
    expect(normalizeContextMenuTimeTravel(1)).toBe(false);
    expect(
      normalizeContextMenuEntity({
        kind: "node",
        id: " n1 ",
        title: " Alpha ",
        rogue: "surface-local payload",
      }),
    ).toEqual({
      kind: "node",
      id: "n1",
      title: "Alpha",
    });
    expect(normalizeContextMenuEntity({ kind: "unknown", id: "n1" })).toBeNull();
    expect(
      normalizeContextMenuEntity({
        kind: "search-result",
        id: "result:1",
        source: "   ",
      }),
    ).toBeNull();
  });

  it("opens with the entity and anchor", () => {
    setContextMenuCursor(3);
    openContextMenu(NODE, { x: 10, y: 20 });
    const s = useContextMenuStore.getState();
    expect(s.open).toBe(true);
    expect(s.entity).toEqual(NODE);
    expect(s.anchor).toEqual({ x: 10, y: 20 });
    expect(s.position).toBeNull();
    expect(s.cursor).toBe(0);
  });

  it("is single-instance: a second open replaces the first and clears arm/cursor", () => {
    openContextMenu(NODE, { x: 10, y: 20 });
    useContextMenuStore.getState().arm("focus:n1");
    setContextMenuCursor(2);
    expect(useContextMenuStore.getState().armedItemId).toBe("focus:n1");
    expect(useContextMenuStore.getState().cursor).toBe(2);

    openContextMenu(EDGE, { x: 99, y: 5 });
    const s = useContextMenuStore.getState();
    expect(s.entity).toEqual(EDGE);
    expect(s.anchor).toEqual({ x: 99, y: 5 });
    expect(s.position).toBeNull();
    expect(s.armedItemId).toBeNull();
    expect(s.cursor).toBe(0);
  });

  it("close clears entity, anchor, arm, and cursor", () => {
    openContextMenu(NODE, { x: 10, y: 20 });
    useContextMenuStore.getState().arm("delete:n1");
    setContextMenuCursor(2);
    closeContextMenu();
    const s = useContextMenuStore.getState();
    expect(s.open).toBe(false);
    expect(s.entity).toBeNull();
    expect(s.anchor).toBeNull();
    expect(s.position).toBeNull();
    expect(s.armedItemId).toBeNull();
    expect(s.cursor).toBe(0);
  });

  it("reset uses the same single close path", () => {
    openContextMenu(NODE, { x: 10, y: 20 });
    useContextMenuStore.getState().arm("delete:n1");
    setContextMenuCursor(2);
    resetContextMenu();

    expect(useContextMenuStore.getState()).toMatchObject({
      open: false,
      entity: null,
      anchor: null,
      position: null,
      armedItemId: null,
      cursor: 0,
    });
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

  it("exposes named arm/disarm helpers for the host seam", () => {
    openContextMenu(NODE, { x: 0, y: 0 });

    armContextMenuItem(" delete:n1 ");
    expect(useContextMenuStore.getState().armedItemId).toBe("delete:n1");

    armContextMenuItem(null);
    expect(useContextMenuStore.getState().armedItemId).toBe("delete:n1");

    armContextMenuItem("x".repeat(ACTION_DESCRIPTOR_ID_MAX_CHARS + 1));
    expect(useContextMenuStore.getState().armedItemId).toBe("delete:n1");

    disarmContextMenu();
    expect(useContextMenuStore.getState().armedItemId).toBeNull();
    expect(useContextMenuStore.getState().open).toBe(true);
  });

  it("exposes a named cursor helper for the singleton host seam", () => {
    openContextMenu(NODE, { x: 0, y: 0 });

    setContextMenuCursor(2.8);

    expect(useContextMenuStore.getState().cursor).toBe(2);

    setContextMenuCursor(Number.NaN);

    expect(useContextMenuStore.getState().cursor).toBe(0);
  });

  it("exposes a named panel-position helper for the singleton host seam", () => {
    openContextMenu(NODE, { x: 10, y: 20 });

    setContextMenuPosition({ x: 8, y: 12 });
    expect(useContextMenuStore.getState().position).toEqual({ x: 8, y: 12 });

    setContextMenuPosition({ x: Number.NaN, y: 12 });
    expect(useContextMenuStore.getState().position).toBeNull();

    closeContextMenu();
    expect(useContextMenuStore.getState().position).toBeNull();
  });

  it("drops malformed open requests before replacing the singleton menu", () => {
    openContextMenu(NODE, { x: 10, y: 20 });

    openContextMenu({ kind: "node", id: "   " }, { x: 40, y: 50 });
    expect(useContextMenuStore.getState()).toMatchObject({
      open: true,
      entity: NODE,
      anchor: { x: 10, y: 20 },
    });

    openContextMenu({ kind: "node", id: "n2" }, { x: Number.NaN, y: 50 });
    expect(useContextMenuStore.getState()).toMatchObject({
      entity: NODE,
      anchor: { x: 10, y: 20 },
    });
  });

  it("derives measured panel position inside the viewport", () => {
    expect(
      deriveContextMenuPanelPosition({ x: 100, y: 100 }, MENU_SIZE, VIEWPORT),
    ).toEqual({
      x: 100,
      y: 100,
    });

    expect(
      deriveContextMenuPanelPosition({ x: 950, y: 100 }, MENU_SIZE, VIEWPORT),
    ).toMatchObject({
      x: 950 - MENU_SIZE.width,
      y: 100,
    });

    expect(
      deriveContextMenuPanelPosition({ x: 100, y: 700 }, MENU_SIZE, VIEWPORT),
    ).toMatchObject({
      x: 100,
      y: 700 - MENU_SIZE.height,
    });

    expect(
      deriveContextMenuPanelPosition(
        { x: 100, y: 400 },
        { width: 200, height: 900 },
        VIEWPORT,
      )?.y,
    ).toBe(8);
    expect(
      deriveContextMenuPanelPosition({ x: 2, y: 100 }, MENU_SIZE, VIEWPORT)?.x,
    ).toBeGreaterThanOrEqual(8);

    expect(
      deriveContextMenuPanelPosition(
        { x: Number.NaN, y: 100 },
        MENU_SIZE,
        VIEWPORT,
      ),
    ).toBeNull();
    expect(
      deriveContextMenuPanelPosition(
        { x: 100, y: 100 },
        { width: Number.POSITIVE_INFINITY, height: 300 },
        VIEWPORT,
      ),
    ).toBeNull();
    expect(
      deriveContextMenuPanelPosition(
        { x: 100, y: 100 },
        MENU_SIZE,
        { width: 0, height: 800 },
      ),
    ).toBeNull();
  });

  it("groups resolved actions in canonical menu order with navigate as default", () => {
    expect(
      groupContextMenuActions([
        { id: "copy", label: "Copy", section: "copy" },
        { id: "focus", label: "Focus" },
        { id: "remove", label: "Remove", section: "danger" },
      ]).map((group) => ({
        section: group.section,
        ids: group.actions.map((action) => action.id),
      })),
    ).toEqual([
      { section: "navigate", ids: ["focus"] },
      { section: "copy", ids: ["copy"] },
      { section: "danger", ids: ["remove"] },
    ]);
  });

  it("derives the resolved host view from the open slice and time-travel gate", () => {
    registerResolver("node", () => [
      { id: "focus", label: "Focus", run: () => undefined },
      { id: "disabled", label: "Disabled", disabled: true, run: () => undefined },
      {
        id: "pin",
        label: "Pin",
        section: "transform",
        disabledInTimeTravel: true,
        run: () => undefined,
      },
    ]);

    openContextMenu(NODE, { x: 10, y: 20 });
    const live = deriveContextMenuResolvedView(useContextMenuStore.getState(), false);
    expect(live.kindLabel).toBe("node");
    expect(live.menuAriaLabel).toBe("node actions");
    expect(live.emptyMessage).toBe("no actions");
    expect(live.activeAction?.id).toBe("focus");
    expect(live.liveMessage).toBe("node actions. Focus");
    expect(live.ordered.map((action) => action.id)).toEqual([
      "focus",
      "disabled",
      "pin",
    ]);
    expect(live.orderedRows.map((row) => row.id)).toEqual(["focus", "disabled", "pin"]);
    expect(live.activeRow).toMatchObject({
      id: "focus",
      index: 0,
      label: "Focus",
      className: "border-l-accent bg-accent-subtle text-ink",
      selected: true,
      armed: false,
      disabled: false,
      confirmShortcutLabel: null,
      acceleratorLabel: null,
      selectionHintVisible: true,
    });
    expect(live.rowGroups.map((group) => group.section)).toEqual([
      "navigate",
      "transform",
    ]);
    expect(live.rowGroups[0]!.rows.map((row) => row.id)).toEqual(["focus", "disabled"]);
    expect(live.rowGroups[0]!.rows[1]).toMatchObject({
      id: "disabled",
      disabled: true,
      className: "cursor-default border-l-transparent text-ink-faint",
    });
    expect(live.runnableIndices).toEqual([0, 2]);

    const historical = deriveContextMenuResolvedView(
      useContextMenuStore.getState(),
      true,
    );
    expect(historical.ordered.map((action) => action.id)).toEqual([
      "focus",
      "disabled",
    ]);
    expect(historical.runnableIndices).toEqual([0]);

    const malformed = deriveContextMenuResolvedView(
      useContextMenuStore.getState(),
      "true",
    );
    expect(malformed.ordered.map((action) => action.id)).toEqual([
      "focus",
      "disabled",
      "pin",
    ]);
  });

  it("derives empty and armed presentation labels in the resolved view", () => {
    registerResolver("node", () => []);
    openContextMenu(NODE, { x: 10, y: 20 });
    expect(
      deriveContextMenuResolvedView(useContextMenuStore.getState(), false),
    ).toMatchObject({
      menuAriaLabel: "node actions",
      emptyMessage: "no actions",
      liveMessage: "node actions: no actions",
    });

    resetResolvers();
    registerResolver("node", () => [
      { id: "delete", label: "Delete", section: "danger", confirm: true, run: noop },
    ]);
    openContextMenu(NODE, { x: 10, y: 20 });
    armContextMenuItem("delete");
    const armed = deriveContextMenuResolvedView(useContextMenuStore.getState(), false);
    expect(armed.liveMessage).toBe("confirm Delete?");
    expect(armed.activeRow).toMatchObject({
      id: "delete",
      label: "confirm Delete?",
      armed: true,
      labelClassName: "flex-1 truncate text-state-stale",
      confirmShortcutLabel: "⏎⏎",
      confirmShortcutClassName:
        "rounded-fg-xs border border-rule px-fg-1 font-mono text-caption text-ink-faint",
      acceleratorLabel: null,
      selectionHintVisible: false,
    });
    expect(armed.rowGroups[0]!.rows[0]).toMatchObject({
      id: "delete",
      label: "confirm Delete?",
      armed: true,
    });
    expect(contextMenuActionLabel(armed.ordered[0]!, true)).toBe("confirm Delete?");
    expect(contextMenuActionLabel(armed.ordered[0]!, false)).toBe("Delete");
  });

  it("projects context-menu row classes from selected and disabled state", () => {
    expect(contextMenuActionRowClassName({ selected: true, disabled: false })).toBe(
      "border-l-accent bg-accent-subtle text-ink",
    );
    expect(contextMenuActionRowClassName({ selected: false, disabled: true })).toBe(
      "cursor-default border-l-transparent text-ink-faint",
    );
    expect(contextMenuActionRowClassName({ selected: false, disabled: false })).toBe(
      "border-l-transparent text-ink-muted hover:bg-paper-sunken hover:text-ink",
    );
  });

  it("derives activation outcomes for disabled, confirm, run, and dispatch paths", () => {
    const run = { id: "focus", label: "Focus", run: noop };
    const confirm = { id: "delete", label: "Delete", confirm: true, run: noop };
    const dispatch = {
      id: "host",
      label: "Reveal",
      dispatch: { type: "host:reveal" },
    };

    expect(
      deriveContextMenuActivation(
        { id: "disabled", label: "Disabled", disabled: true },
        null,
        () => true,
      ),
    ).toEqual({ kind: "ignore" });
    expect(deriveContextMenuActivation(confirm, null, () => true)).toEqual({
      kind: "arm",
      itemId: "delete",
    });
    expect(deriveContextMenuActivation(confirm, "delete", () => true)).toEqual({
      kind: "run",
      action: confirm,
    });
    expect(deriveContextMenuActivation(run, null, () => true)).toEqual({
      kind: "run",
      action: run,
    });
    expect(deriveContextMenuActivation(dispatch, null, () => true)).toEqual({
      kind: "dispatch",
      action: dispatch,
      dispatch: { type: "host:reveal" },
      type: "host:reveal",
    });
    expect(deriveContextMenuActivation(dispatch, null, () => false)).toEqual({
      kind: "missing-dispatch",
      type: "host:reveal",
    });
  });

  it("projects context-menu row sub-chrome from row state", () => {
    registerResolver("node", () => [
      {
        id: "focus",
        label: "Focus",
        accelerator: "F",
        run: noop,
      },
    ]);
    openContextMenu(NODE, { x: 10, y: 20 });

    const view = deriveContextMenuResolvedView(useContextMenuStore.getState(), false);

    expect(view.activeRow).toMatchObject({
      iconClassName: "shrink-0 text-ink-faint",
      iconSpacerClassName: "size-3.5 shrink-0",
      labelClassName: "flex-1 truncate",
      acceleratorClassName: "font-mono text-caption text-ink-faint",
      selectionHintClassName: "text-ink-faint",
    });
  });

  it("repairs cursor and arm state against the current runnable row set", () => {
    const ordered = [
      { id: "disabled", label: "Disabled", disabled: true },
      { id: "focus", label: "Focus", run: noop },
    ];

    expect(
      deriveContextMenuCursorRepair({
        open: true,
        cursor: 7,
        runnableIndices: [1],
        ordered,
        armedItemId: null,
      }),
    ).toEqual({
      cursor: 1,
      changed: true,
      disarm: false,
    });

    expect(
      deriveContextMenuCursorRepair({
        open: true,
        cursor: 1,
        runnableIndices: [1],
        ordered,
        armedItemId: "delete",
      }),
    ).toEqual({
      cursor: 1,
      changed: false,
      disarm: true,
    });
  });

  it("derives keyboard cursor movement from runnable row indices", () => {
    expect(deriveContextMenuCursorMove(0, [0, 2, 4], 1)).toBe(2);
    expect(deriveContextMenuCursorMove(2, [0, 2, 4], -1)).toBe(0);
    expect(deriveContextMenuCursorMove(4, [0, 2, 4], 1)).toBe(4);
    expect(deriveContextMenuCursorMove(99, [0, 2, 4], 1)).toBe(0);
    expect(deriveContextMenuCursorMove(99, [0, 2, 4], -1)).toBe(4);
    expect(deriveContextMenuCursorMove(0, [], 1)).toBeNull();
  });

  it("derives keyboard cursor edge targets from runnable row indices", () => {
    expect(deriveContextMenuCursorEdge([2, 4, 9], "first")).toBe(2);
    expect(deriveContextMenuCursorEdge([2, 4, 9], "last")).toBe(9);
    expect(deriveContextMenuCursorEdge([], "first")).toBeNull();
    expect(deriveContextMenuCursorEdge([], "last")).toBeNull();
  });
});
