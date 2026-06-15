import { create } from "zustand";

import type { EntityDescriptor } from "../../platform/actions/entity";

// The context-menu open-state slice (dashboard-context-menus ADR, layer 4).
// The menu is global-singleton chrome: only one can be open at a time, so its
// open state is one small view-store concept rather than per-surface component
// state. A surface opens the menu by publishing the entity under the pointer and
// the anchor point; the host derives the items from the resolver registry (pure,
// time-travel-reactive) and renders them. Any dismiss path clears the slice and
// disarms. The items themselves are NOT stored - they are a pure function of the
// entity + app state, derived in the host so they stay live.

export interface MenuAnchor {
  x: number;
  y: number;
}

export interface ContextMenuState {
  open: boolean;
  /** Viewport-space point to anchor the menu at (pointer or focused row edge). */
  anchor: MenuAnchor | null;
  /** The entity under the pointer; the registry resolves its menu by `kind`. */
  entity: EntityDescriptor | null;
  /** Which destructive item is armed (arm-to-confirm), tracked here so the host
   *  can disarm on any exit and the armed row can never desync. */
  armedItemId: string | null;

  /** Open (or re-open) the singleton menu for an entity at a point. Replaces any
   *  currently-open menu and clears a stale arm. */
  openMenu: (entity: EntityDescriptor, anchor: MenuAnchor) => void;
  /** Close the menu and disarm. The single exit path every dismiss routes through. */
  closeMenu: () => void;
  /** Arm a destructive item (first activation). */
  arm: (itemId: string) => void;
  /** Disarm without firing (navigate away / cancel). */
  disarm: () => void;
}

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  open: false,
  anchor: null,
  entity: null,
  armedItemId: null,

  openMenu: (entity, anchor) =>
    // Single-instance: a second open replaces the first wholesale, never stacks,
    // and resets the armed slot so a prior menu's arm cannot ride into the new one.
    set({ open: true, entity, anchor, armedItemId: null }),
  closeMenu: () => set({ open: false, entity: null, anchor: null, armedItemId: null }),
  arm: (itemId) => set({ armedItemId: itemId }),
  disarm: () => set({ armedItemId: null }),
}));

/** Imperative open from any surface (pointer or keyboard entry). */
export function openContextMenu(entity: EntityDescriptor, anchor: MenuAnchor): void {
  useContextMenuStore.getState().openMenu(entity, anchor);
}

/** Imperative close (used by light-dismiss paths outside React event handlers). */
export function closeContextMenu(): void {
  useContextMenuStore.getState().closeMenu();
}
