import { selectNode, openNodeIsland, closeNodeIsland } from "./selection";
import { togglePinnedNode } from "./pins";
import { clearWorkingSet, collapseWorkingSet, expandWorkingSet } from "./workingSet";
import { normalizeStoreScope } from "../server/scopeIdentity";

export interface ScopedMenuEntity {
  scope?: unknown;
}

export function menuEntityScope(entity: ScopedMenuEntity): unknown {
  return "scope" in entity ? normalizeStoreScope(entity.scope) : undefined;
}

export function focusMenuNode(nodeId: unknown, entity?: ScopedMenuEntity): void {
  const scope = entity ? menuEntityScope(entity) : undefined;
  const request =
    scope === undefined
      ? selectNode(nodeId ?? null)
      : selectNode(nodeId ?? null, scope);
  void request.catch(() => undefined);
}

export function openMenuNodeIsland(id: unknown, entity?: ScopedMenuEntity): void {
  const scope = entity ? menuEntityScope(entity) : undefined;
  const request = scope === undefined ? openNodeIsland(id) : openNodeIsland(id, scope);
  void request.catch(() => undefined);
}

export function closeMenuNodeIsland(id: unknown): void {
  closeNodeIsland(id);
}

export function toggleMenuPinnedNode(id: unknown): void {
  togglePinnedNode(id);
}

export function expandMenuWorkingSet(id: unknown): void {
  expandWorkingSet(id);
}

export function collapseMenuWorkingSet(id: unknown): void {
  collapseWorkingSet(id);
}

export function clearMenuWorkingSet(): void {
  clearWorkingSet();
}
