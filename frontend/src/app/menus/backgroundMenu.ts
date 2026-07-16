// Background context menu (background-context-menus ADR): the resolver for the `background`
// entity kind — empty left-rail / right-rail / timeline space. It contributes the app-chrome
// escape hatches (the shared chromeActions builders, composed not re-authored); the global
// tail (Refresh) appends automatically because it is kind-agnostic. Mirrors canvasMenu's
// shape: a pure resolver registered for one kind.

import type { ActionDescriptor } from "../../platform/actions/action";
import { normalizeEntityDescriptor } from "../../platform/actions/entity";
import type { ActionResolver } from "../../platform/actions/registry";
import { registerResolver } from "../../platform/actions/registry";
import {
  chromeEscapeHatchActions,
  toggleFollowModeAction,
  toggleGraphAction,
} from "../../stores/view/chromeActions";
import { agentTogglePanelAction } from "../../stores/view/agentActions";
import { timelineDateCriterionActions } from "../timeline/menus/timelineFilterActions";

export function backgroundMenu(entity: unknown): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "background") return [];
  // The timeline empty-space menu carries the region-specific "Filter by" date-criterion
  // group (Issue #14), ahead of the universal verbs.
  const regional =
    normalizedEntity.region === "timeline" ? timelineDateCriterionActions() : [];
  // Region-agnostic tail: every background offers the same universal escape-hatch set, the
  // graph toggle (appshell-reframe #11 — show/hide the graph + tethered timeline), and the
  // follow-mode toggle (follow-mode-selection-sync: the bidirectional rail<->graph selection
  // tether), each one shared builder.
  return [
    ...regional,
    ...chromeEscapeHatchActions(),
    toggleGraphAction(),
    agentTogglePanelAction(),
    toggleFollowModeAction(),
  ];
}

registerResolver("background", backgroundMenu as ActionResolver);
