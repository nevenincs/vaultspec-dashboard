import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useEffect, useMemo } from "react";

import {
  ACTION_DESCRIPTOR_ID_MAX_CHARS,
  ACTION_SECTION_ORDER,
  isRunnable,
  type ActionDescriptor,
  type ActionSection,
} from "../../platform/actions/action";
import {
  normalizeEntityDescriptor,
  type EntityDescriptor,
} from "../../platform/actions/entity";
import { resolveActions } from "../../platform/actions/registry";

// The context-menu open-state slice (dashboard-context-menus ADR, layer 4).
// The menu is global-singleton chrome: only one can be open at a time, so its
// open state is one small view-store concept rather than per-surface component
// state. A surface opens the menu by publishing the entity under the pointer and
// the anchor point; this module derives the resolved action view from the resolver
// registry (pure, time-travel-reactive) so the host renders one interpreted menu
// model. Any dismiss path clears the slice and disarms. The items themselves are
// NOT stored - they are a pure function of the entity + app state.

export interface MenuAnchor {
  x: number;
  y: number;
}

export interface ContextMenuState {
  open: boolean;
  /** Viewport-space point to anchor the menu at (pointer or focused row edge). */
  anchor: MenuAnchor | null;
  /** Computed, viewport-clamped panel position after host measurement. */
  position: MenuAnchor | null;
  /** The entity under the pointer; the registry resolves its menu by `kind`. */
  entity: EntityDescriptor | null;
  /** Which destructive item is armed (arm-to-confirm), tracked here so the host
   *  can disarm on any exit and the armed row can never desync. */
  armedItemId: string | null;
  /** Flat ordered action index under keyboard/pointer focus for the singleton menu. */
  cursor: number;

  /** Open (or re-open) the singleton menu for an entity at a point. Replaces any
   *  currently-open menu and clears a stale arm. */
  openMenu: (entity: unknown, anchor: unknown) => void;
  /** Close the menu and disarm. The single exit path every dismiss routes through. */
  closeMenu: () => void;
  /** Arm a destructive item (first activation). */
  arm: (itemId: unknown) => void;
  /** Disarm without firing (navigate away / cancel). */
  disarm: () => void;
  /** Move keyboard/pointer focus to a flat ordered action index. */
  setCursor: (cursor: unknown) => void;
  /** Publish the measured/clamped panel position for the singleton host. */
  setPosition: (position: unknown) => void;
}

function isContextMenuRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function normalizeContextMenuAnchor(value: unknown): MenuAnchor | null {
  if (!isContextMenuRecord(value)) return null;
  const { x, y } = value;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    return null;
  }
  return { x, y };
}

export function normalizeContextMenuPanelSize(
  value: unknown,
): ContextMenuPanelSize | null {
  if (!isContextMenuRecord(value)) return null;
  const { width, height } = value;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 0 ||
    height < 0
  ) {
    return null;
  }
  return { width, height };
}

export function normalizeContextMenuViewport(
  value: unknown,
): ContextMenuViewport | null {
  if (!isContextMenuRecord(value)) return null;
  const { width, height } = value;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return { width, height };
}

export function normalizeContextMenuCursor(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : 0;
}

export function normalizeContextMenuItemId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 &&
    normalized.length <= ACTION_DESCRIPTOR_ID_MAX_CHARS
    ? normalized
    : null;
}

export function normalizeContextMenuEntity(value: unknown): EntityDescriptor | null {
  return normalizeEntityDescriptor(value);
}

export function normalizeContextMenuTimeTravel(value: unknown): boolean {
  return value === true;
}

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  open: false,
  anchor: null,
  position: null,
  entity: null,
  armedItemId: null,
  cursor: 0,

  openMenu: (entity, anchor) =>
    // Single-instance: a second open replaces the first wholesale, never stacks,
    // and resets keyboard focus + the armed slot so prior menu state cannot ride
    // into the new one.
    set((state) => {
      const normalizedEntity = normalizeContextMenuEntity(entity);
      const normalizedAnchor = normalizeContextMenuAnchor(anchor);
      if (normalizedEntity === null || normalizedAnchor === null) return state;
      return {
        open: true,
        entity: normalizedEntity,
        anchor: normalizedAnchor,
        position: null,
        armedItemId: null,
        cursor: 0,
      };
    }),
  closeMenu: () =>
    set({
      open: false,
      entity: null,
      anchor: null,
      position: null,
      armedItemId: null,
      cursor: 0,
    }),
  arm: (itemId) => {
    const normalized = normalizeContextMenuItemId(itemId);
    if (normalized !== null) set({ armedItemId: normalized });
  },
  disarm: () => set({ armedItemId: null }),
  setCursor: (cursor) => set({ cursor: normalizeContextMenuCursor(cursor) }),
  setPosition: (position) =>
    set((state) => {
      const normalized =
        position === null ? null : normalizeContextMenuAnchor(position);
      if (state.position?.x === normalized?.x && state.position?.y === normalized?.y) {
        return state;
      }
      return { position: normalized };
    }),
}));

export interface ContextMenuSnapshot {
  open: boolean;
  anchor: MenuAnchor | null;
  position: MenuAnchor | null;
  entity: EntityDescriptor | null;
  armedItemId: string | null;
  cursor: number;
}

export interface ContextMenuActionGroup {
  section: ActionSection;
  actions: ActionDescriptor[];
}

export interface ContextMenuActionRowView {
  action: ActionDescriptor;
  id: string;
  index: number;
  icon: ActionDescriptor["icon"];
  label: string;
  className: string;
  iconClassName: string;
  iconSpacerClassName: string;
  labelClassName: string;
  selected: boolean;
  armed: boolean;
  disabled: boolean;
  disabledReason: string | undefined;
  confirmShortcutLabel: string | null;
  confirmShortcutClassName: string;
  acceleratorLabel: string | null;
  acceleratorClassName: string;
  selectionHintVisible: boolean;
  selectionHintClassName: string;
}

export interface ContextMenuActionRowGroupView {
  section: ActionSection;
  rows: ContextMenuActionRowView[];
}

export interface ContextMenuResolvedView extends ContextMenuSnapshot {
  /** Resolved, time-travel-gated actions for the current entity. */
  actions: ActionDescriptor[];
  /** Resolved actions grouped into the canonical section order. */
  groups: ContextMenuActionGroup[];
  /** Resolved action rows grouped with presentation state owned by the view seam. */
  rowGroups: ContextMenuActionRowGroupView[];
  /** Flat display order after section grouping. */
  ordered: ActionDescriptor[];
  /** Flat row view order after section grouping. */
  orderedRows: ContextMenuActionRowView[];
  /** Flat-order indices that can be activated by keyboard cursor movement. */
  runnableIndices: number[];
  /** Human label for the entity kind used by menu chrome and live regions. */
  kindLabel: string | null;
  /** The currently focused action in flat display order. */
  activeAction: ActionDescriptor | undefined;
  /** The currently focused row in flat display order. */
  activeRow: ContextMenuActionRowView | undefined;
  /** Accessible menu label. */
  menuAriaLabel: string;
  /** Empty-state copy when a resolver returns no actions. */
  emptyMessage: string;
  /** Polite live-region copy for entity, focus, and confirm state. */
  liveMessage: string;
}

export interface ContextMenuCursorRepair {
  cursor: number;
  changed: boolean;
  disarm: boolean;
}

export type ContextMenuActivationView =
  | { kind: "ignore" }
  | { kind: "arm"; itemId: string }
  | { kind: "run"; action: ActionDescriptor }
  | {
      kind: "dispatch";
      action: ActionDescriptor;
      dispatch: NonNullable<ActionDescriptor["dispatch"]>;
      type: string;
    }
  | { kind: "missing-dispatch"; type: string };

export interface ContextMenuPanelSize {
  width: number;
  height: number;
}

export interface ContextMenuViewport {
  width: number;
  height: number;
}

const DEFAULT_SECTION: ActionSection = "navigate";
const CONTEXT_MENU_EDGE_MARGIN = 8;
const CONTEXT_MENU_ROW_ICON_CLASS = "shrink-0 text-ink-faint";
const CONTEXT_MENU_ROW_ICON_SPACER_CLASS = "size-3.5 shrink-0";
const CONTEXT_MENU_ROW_LABEL_BASE_CLASS = "flex-1 truncate";
const CONTEXT_MENU_ROW_LABEL_ARMED_CLASS = `${CONTEXT_MENU_ROW_LABEL_BASE_CLASS} text-state-stale`;
const CONTEXT_MENU_ROW_SHORTCUT_CLASS =
  "rounded-fg-xs border border-rule px-fg-1 font-mono text-caption text-ink-faint";
const CONTEXT_MENU_ROW_ACCELERATOR_CLASS = "font-mono text-caption text-ink-faint";
const CONTEXT_MENU_ROW_HINT_CLASS = "text-ink-faint";

function sectionOf(action: ActionDescriptor): ActionSection {
  return action.section ?? DEFAULT_SECTION;
}

export function groupContextMenuActions(
  actions: readonly ActionDescriptor[],
): ContextMenuActionGroup[] {
  return ACTION_SECTION_ORDER.map((section) => ({
    section,
    actions: actions.filter((action) => sectionOf(action) === section),
  })).filter((group) => group.actions.length > 0);
}

export function deriveContextMenuResolvedView(
  snapshot: ContextMenuSnapshot,
  timeTravel: unknown,
): ContextMenuResolvedView {
  const normalizedTimeTravel = normalizeContextMenuTimeTravel(timeTravel);
  const actions = snapshot.entity
    ? resolveActions(snapshot.entity, { timeTravel: normalizedTimeTravel })
    : [];
  const groups = groupContextMenuActions(actions);
  const ordered = groups.flatMap((group) => group.actions);
  const orderedRows: ContextMenuActionRowView[] = ordered.map((action, index) => {
    const armed = snapshot.armedItemId === action.id;
    const selected = index === snapshot.cursor;
    const hasConfirmHint = action.confirm === true;
    const acceleratorLabel =
      action.accelerator && !hasConfirmHint ? action.accelerator : null;
    return {
      action,
      id: action.id,
      index,
      icon: action.icon,
      label: contextMenuActionLabel(action, armed),
      className: contextMenuActionRowClassName({
        selected,
        disabled: action.disabled === true,
      }),
      iconClassName: CONTEXT_MENU_ROW_ICON_CLASS,
      iconSpacerClassName: CONTEXT_MENU_ROW_ICON_SPACER_CLASS,
      labelClassName: armed
        ? CONTEXT_MENU_ROW_LABEL_ARMED_CLASS
        : CONTEXT_MENU_ROW_LABEL_BASE_CLASS,
      selected,
      armed,
      disabled: action.disabled === true,
      disabledReason: action.disabled === true ? action.disabledReason : undefined,
      confirmShortcutLabel: hasConfirmHint ? "⏎⏎" : null,
      confirmShortcutClassName: CONTEXT_MENU_ROW_SHORTCUT_CLASS,
      acceleratorLabel,
      acceleratorClassName: CONTEXT_MENU_ROW_ACCELERATOR_CLASS,
      selectionHintVisible: selected && !hasConfirmHint && acceleratorLabel === null,
      selectionHintClassName: CONTEXT_MENU_ROW_HINT_CLASS,
    };
  });
  const rowsById = new Map(orderedRows.map((row) => [row.id, row]));
  const rowGroups = groups.map((group) => ({
    section: group.section,
    rows: group.actions
      .map((action) => rowsById.get(action.id))
      .filter((row): row is ContextMenuActionRowView => row !== undefined),
  }));
  const kindLabel = snapshot.entity?.kind.replace(/-/g, " ") ?? null;
  const label = kindLabel ?? "entity";
  const activeAction = ordered[snapshot.cursor];
  const activeRow = orderedRows[snapshot.cursor];
  const menuAriaLabel = `${label} actions`;
  const emptyMessage = "no actions";
  const liveMessage =
    !snapshot.open || !snapshot.entity
      ? ""
      : activeAction === undefined
        ? `${menuAriaLabel}: ${emptyMessage}`
        : snapshot.armedItemId === activeAction.id
          ? contextMenuActionLabel(activeAction, true)
          : `${menuAriaLabel}. ${activeAction.label}`;
  return {
    ...snapshot,
    actions,
    groups,
    rowGroups,
    ordered,
    orderedRows,
    runnableIndices: ordered
      .map((action, index) => (isRunnable(action) ? index : -1))
      .filter((index) => index >= 0),
    kindLabel,
    activeAction,
    activeRow,
    menuAriaLabel,
    emptyMessage,
    liveMessage,
  };
}

export function contextMenuActionRowClassName(state: {
  selected: boolean;
  disabled: boolean;
}): string {
  if (state.disabled) return "cursor-default border-l-transparent text-ink-faint";
  return state.selected
    ? "border-l-accent bg-accent-subtle text-ink"
    : "border-l-transparent text-ink-muted hover:bg-paper-sunken hover:text-ink";
}

export function contextMenuActionLabel(
  action: Pick<ActionDescriptor, "label">,
  armed: boolean,
): string {
  return armed ? `confirm ${action.label}?` : action.label;
}

export function deriveContextMenuActivation(
  action: ActionDescriptor,
  armedItemId: string | null,
  canDispatchType: (type: string) => boolean,
): ContextMenuActivationView {
  if (!isRunnable(action)) return { kind: "ignore" };
  if (action.confirm && armedItemId !== action.id) {
    return { kind: "arm", itemId: action.id };
  }
  if (action.dispatch) {
    const dispatch = action.dispatch;
    const type = dispatch.type;
    return canDispatchType(type)
      ? { kind: "dispatch", action, dispatch, type }
      : { kind: "missing-dispatch", type };
  }
  return { kind: "run", action };
}

export function deriveContextMenuCursorRepair(
  view: Pick<
    ContextMenuResolvedView,
    "open" | "cursor" | "runnableIndices" | "ordered" | "armedItemId"
  >,
): ContextMenuCursorRepair {
  const cursor = view.runnableIndices.includes(view.cursor)
    ? view.cursor
    : (deriveContextMenuCursorEdge(view.runnableIndices, "first") ?? 0);
  const active = view.ordered[cursor];
  return {
    cursor,
    changed: cursor !== view.cursor,
    disarm:
      view.open &&
      view.armedItemId !== null &&
      (!active || active.id !== view.armedItemId || !isRunnable(active)),
  };
}

export function deriveContextMenuCursorMove(
  cursor: number,
  runnableIndices: readonly number[],
  delta: 1 | -1,
): number | null {
  if (runnableIndices.length === 0) return null;
  const here = runnableIndices.indexOf(cursor);
  const nextPos =
    here < 0
      ? delta === 1
        ? 0
        : runnableIndices.length - 1
      : Math.min(runnableIndices.length - 1, Math.max(0, here + delta));
  return runnableIndices[nextPos] ?? null;
}

export function deriveContextMenuCursorEdge(
  runnableIndices: readonly number[],
  edge: "first" | "last",
): number | null {
  if (runnableIndices.length === 0) return null;
  return edge === "first"
    ? (runnableIndices[0] ?? null)
    : (runnableIndices[runnableIndices.length - 1] ?? null);
}

function contextMenuAxisPosition(
  anchor: number,
  extent: number,
  bound: number,
): number {
  if (anchor + extent + CONTEXT_MENU_EDGE_MARGIN <= bound) {
    return Math.max(CONTEXT_MENU_EDGE_MARGIN, anchor);
  }
  const flipped = anchor - extent;
  if (flipped >= CONTEXT_MENU_EDGE_MARGIN) return flipped;
  return Math.max(CONTEXT_MENU_EDGE_MARGIN, bound - extent - CONTEXT_MENU_EDGE_MARGIN);
}

export function deriveContextMenuPanelPosition(
  anchor: unknown,
  size: unknown,
  viewport: unknown,
): MenuAnchor | null {
  const normalizedAnchor = normalizeContextMenuAnchor(anchor);
  const normalizedSize = normalizeContextMenuPanelSize(size);
  const normalizedViewport = normalizeContextMenuViewport(viewport);
  if (
    normalizedAnchor === null ||
    normalizedSize === null ||
    normalizedViewport === null
  ) {
    return null;
  }
  return {
    x: contextMenuAxisPosition(
      normalizedAnchor.x,
      normalizedSize.width,
      normalizedViewport.width,
    ),
    y: contextMenuAxisPosition(
      normalizedAnchor.y,
      normalizedSize.height,
      normalizedViewport.height,
    ),
  };
}

export function useContextMenuState(): ContextMenuSnapshot {
  return useContextMenuStore(
    useShallow((state) => ({
      open: state.open,
      anchor: state.anchor,
      position: state.position,
      entity: state.entity,
      armedItemId: state.armedItemId,
      cursor: state.cursor,
    })),
  );
}

export function useContextMenuResolvedView(
  timeTravel: unknown,
): ContextMenuResolvedView {
  const snapshot = useContextMenuState();
  const normalizedTimeTravel = normalizeContextMenuTimeTravel(timeTravel);
  return useMemo(
    () => deriveContextMenuResolvedView(snapshot, normalizedTimeTravel),
    [snapshot, normalizedTimeTravel],
  );
}

export function useContextMenuViewportDismiss(): void {
  const open = useContextMenuStore((state) => state.open);

  useEffect(() => {
    if (!open) return;
    const dismiss = () => closeContextMenu();

    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [open]);
}

/** Imperative open from any surface (pointer or keyboard entry). */
export function openContextMenu(entity: unknown, anchor: unknown): void {
  useContextMenuStore.getState().openMenu(entity, anchor);
}

/** Imperative close (used by light-dismiss paths outside React event handlers). */
export function closeContextMenu(): void {
  useContextMenuStore.getState().closeMenu();
}

export function armContextMenuItem(itemId: unknown): void {
  useContextMenuStore.getState().arm(itemId);
}

export function disarmContextMenu(): void {
  useContextMenuStore.getState().disarm();
}

export function setContextMenuCursor(cursor: unknown): void {
  useContextMenuStore.getState().setCursor(cursor);
}

export function setContextMenuPosition(position: unknown): void {
  useContextMenuStore.getState().setPosition(position);
}

export function resetContextMenu(): void {
  useContextMenuStore.getState().closeMenu();
}
