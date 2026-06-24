// Background context menu (background-context-menus ADR): the resolver for the `background`
// entity kind — empty left-rail / right-rail / timeline space. It contributes the app-chrome
// escape hatches (the shared chromeActions builders, composed not re-authored); the global
// tail (Refresh) appends automatically because it is kind-agnostic. Mirrors canvasMenu's
// shape: a pure resolver registered for one kind.

import type { ActionDescriptor } from "../../platform/actions/action";
import { normalizeEntityDescriptor } from "../../platform/actions/entity";
import type { ActionResolver } from "../../platform/actions/registry";
import { registerResolver } from "../../platform/actions/registry";
import { chromeEscapeHatchActions } from "../../stores/view/chromeActions";

export function backgroundMenu(entity: unknown): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "background") return [];
  // Region is carried for future region-specific verbs; today every background offers the
  // same universal escape-hatch set.
  return chromeEscapeHatchActions();
}

registerResolver("background", backgroundMenu as ActionResolver);
