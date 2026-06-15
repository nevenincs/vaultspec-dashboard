// The resolver registry (dashboard-context-menus ADR, layer 3): a generic menu
// host fed by per-surface resolvers contributed against an entity kind (the VS
// Code "contributed menus" model adapted to this stack). A surface registers a
// pure `(entity, ctx) => ActionDescriptor[]` for its entity kind; the host calls
// `resolveActions` with the entity under the pointer and gets the menu. The host
// stays generic; surfaces contribute. Applicability and disabling are decided in
// the resolver (context-menus-are-resolved-from-an-entity-descriptor).
//
// Substrate module: no imports from app/, scene/, or stores. Resolvers live in
// the app layer and read stores themselves; the central time-travel gate
// (W02.P06) is the one cross-cutting concern this pipeline applies.

import type { ActionDescriptor } from "./action";
import type { EntityDescriptor, EntityKind } from "./entity";

/** App state a resolver may read; the central gate reads `timeTravel`. */
export interface ActionContext {
  /** True when the view is in time-travel mode. */
  timeTravel: boolean;
}

/** A pure resolver: the menu for one entity kind. */
export type ActionResolver<E extends EntityDescriptor = EntityDescriptor> = (
  entity: E,
  ctx: ActionContext,
) => ActionDescriptor[];

const resolvers = new Map<EntityKind, ActionResolver>();

/** Narrow an entity descriptor to the variant for a given kind. */
type EntityOfKind<K extends EntityKind> = Extract<EntityDescriptor, { kind: K }>;

/** Register the resolver for one entity kind; returns a disposer. */
export function registerResolver<K extends EntityKind>(
  kind: K,
  resolver: ActionResolver<EntityOfKind<K>>,
): () => void {
  const erased = resolver as ActionResolver;
  resolvers.set(kind, erased);
  return () => {
    if (resolvers.get(kind) === erased) resolvers.delete(kind);
  };
}

export function hasResolver(kind: EntityKind): boolean {
  return resolvers.has(kind);
}

/**
 * Resolve the menu for an entity. Returns [] for an unregistered kind (a quiet
 * empty menu, never an error). The central time-travel gate (W02.P06) is applied
 * here, once: a mutating action marks itself `disabledInTimeTravel` on the
 * descriptor, and the pipeline REMOVES those actions in time-travel mode so no
 * surface re-derives the gate and no historical-mode mutation can leak through
 * any menu (actions-dispatch-through-the-one-seam).
 */
export function resolveActions(
  entity: EntityDescriptor,
  ctx: ActionContext,
): ActionDescriptor[] {
  const resolver = resolvers.get(entity.kind);
  if (!resolver) return [];
  const actions = resolver(entity, ctx);
  if (!ctx.timeTravel) return actions;
  return actions.filter((action) => action.disabledInTimeTravel !== true);
}

/** Test-only: drop all registered resolvers. */
export function resetResolvers(): void {
  resolvers.clear();
}
