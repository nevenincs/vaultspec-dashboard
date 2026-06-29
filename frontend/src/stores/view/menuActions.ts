import { selectNode, closeNodeIsland } from "./selection";
import { activateEntity } from "./activateEntity";
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

// The shared "Open" verb for a result entity (the openEntityAction chain →
// searchResultMenu et al.): open the entity as a #15 dock tab through the ONE canonical
// activation seam (unified-selection). A result open is off-canvas, so it materializes
// + frames the node on the graph (c), and an explicit Open pegs a PERMANENT tab.
export function openMenuNodeIsland(id: unknown, entity?: ScopedMenuEntity): void {
  const scope = entity ? menuEntityScope(entity) : undefined;
  void activateEntity(id, scope, { permanent: true, frame: true }).catch(
    () => undefined,
  );
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
