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
  /** The currently selected/focused node id (the dashboard's canonical node
   *  selection), or null. Lets a resolver build an action RELATIVE to the
   *  selection (e.g. "relate this document to the focused node") as a pure
   *  derived-state consumer, without reaching into a store. */
  selectedNodeId?: string | null;
  /** The active scope (workspace path), or null. Lets a resolver build an
   *  action that writes shared dashboard state for the active scope (e.g. the
   *  commit row's "View corpus at this commit" time-travel entry) as a pure
   *  derived-state consumer, without reaching into a store — exactly as
   *  `selectedNodeId` is threaded from the host. */
  scope?: string | null;
  /** The active graph corpus (`vault` | `code`), threaded like `scope` so a
   *  resolver can honestly disable a vault-only capability while code is
   *  active (the commit row's time-travel entry — the code corpus has no
   *  git-history axis; code-timeline-range ADR). Absent ≡ vault. */
  corpus?: "vault" | "code";
}

/** A pure resolver: the menu for one entity kind. */
export type ActionResolver<E extends EntityDescriptor = EntityDescriptor> = (
  entity: E,
  ctx: ActionContext,
) => ActionDescriptor[];

const resolvers = new Map<EntityKind, ActionResolver>();

// Global-tail contributors (global-context-actions ADR D2): kind-agnostic resolvers
// whose actions are appended to EVERY resolved menu, after the per-kind body, under the
// terminal `global` section. Registered once at app load (the Refresh state control is
// the sole shipped member, D3); the seam stays open for any future truly-universal verb.
const globalTailResolvers = new Set<ActionResolver>();

export { normalizeEntityKind };

/**
 * Register a global-tail resolver appended to every menu; returns a disposer. The
 * resolver is kind-agnostic (it receives the entity + ctx but is expected to ignore the
 * kind) and its actions should carry `section: "global"` so they render in the terminal
 * tail. Multiple registrations append in registration order.
 */
export function registerGlobalTailActions(resolver: ActionResolver): () => void {
  if (typeof resolver !== "function") return () => undefined;
  globalTailResolvers.add(resolver);
  return () => {
    globalTailResolvers.delete(resolver);
  };
}

function resolveGlobalTail(
  entity: EntityDescriptor,
  ctx: ActionContext,
): ActionDescriptor[] {
  const out: ActionDescriptor[] = [];
  for (const resolver of globalTailResolvers) {
    for (const action of resolver(entity, ctx)) {
      const normalized = normalizeActionDescriptor(action);
      if (normalized !== null) out.push(normalized);
    }
  }
  return out;
}

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
  // Only a registered kind is a real menu target; an unresolved kind opens no menu, so
  // the global tail does not spawn a Refresh-only menu where none would otherwise exist.
  if (!resolver) return [];
  const kindActions = resolver(normalizedEntity, ctx)
    .map((action) => normalizeActionDescriptor(action))
    .filter((action): action is ActionDescriptor => action !== null);
  // The global tail (D2) is appended after the per-kind body, then the ONE time-travel
  // filter below gates per-kind and tail actions uniformly.
  const actions = kindActions.concat(resolveGlobalTail(normalizedEntity, ctx));
  if (!ctx.timeTravel) return actions;
  return actions.filter((action) => action.disabledInTimeTravel !== true);
}

/** Test-only: drop all registered resolvers and global-tail contributors. */
export function resetResolvers(): void {
  resolvers.clear();
  globalTailResolvers.clear();
}
