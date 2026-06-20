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

import { normalizeActionDescriptor, type ActionDescriptor } from "./action";
import {
  normalizeEntityDescriptor,
  normalizeEntityKind,
  type EntityDescriptor,
  type EntityKind,
} from "./entity";

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

export { normalizeEntityKind };

export function normalizeActionEntity(entity: unknown): EntityDescriptor | null {
  return normalizeEntityDescriptor(entity);
}

/** Narrow an entity descriptor to the variant for a given kind. */
type EntityOfKind<K extends EntityKind> = Extract<EntityDescriptor, { kind: K }>;

/** Register the resolver for one entity kind; returns a disposer. */
export function registerResolver<K extends EntityKind>(
  kind: K,
  resolver: ActionResolver<EntityOfKind<K>>,
): () => void;
export function registerResolver(kind: unknown, resolver: unknown): () => void;
export function registerResolver(kind: unknown, resolver: unknown): () => void {
  const normalizedKind = normalizeEntityKind(kind);
  if (normalizedKind === null) {
    throw new Error("action resolver has a malformed entity kind");
  }
  if (typeof resolver !== "function") return () => undefined;
  const erased = resolver as ActionResolver;
  resolvers.set(normalizedKind, erased);
  return () => {
    if (resolvers.get(normalizedKind) === erased) resolvers.delete(normalizedKind);
  };
}

export function hasResolver(kind: unknown): boolean {
  const normalizedKind = normalizeEntityKind(kind);
  return normalizedKind === null ? false : resolvers.has(normalizedKind);
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
  entity: unknown,
  ctx: ActionContext,
): ActionDescriptor[] {
  const normalizedEntity = normalizeActionEntity(entity);
  if (normalizedEntity === null) return [];
  const resolver = resolvers.get(normalizedEntity.kind);
  if (!resolver) return [];
  const actions = resolver(normalizedEntity, ctx)
    .map((action) => normalizeActionDescriptor(action))
    .filter((action): action is ActionDescriptor => action !== null);
  if (!ctx.timeTravel) return actions;
  return actions.filter((action) => action.disabledInTimeTravel !== true);
}

/** Test-only: drop all registered resolvers. */
export function resetResolvers(): void {
  resolvers.clear();
}
