// Stage scene-event bridge. The scene reports gestures and renderer echoes; this
// stores/view seam translates them into shared state intents so Stage does not
// re-implement hover, open, expansion, context-menu, or applied-mode decisions.

import type { SceneEvent } from "../../scene/sceneController";
import type { RepresentationMode } from "../../scene/field/representationLayout";
import type { EntityDescriptor } from "../../platform/actions/entity";
import { activateEntity } from "./activateEntity";
import { openContextMenu, type MenuAnchor } from "./contextMenu";
import { nodeEntityView } from "./nodeEntity";
import { setHoveredNodeId } from "./selection";
import { setRenderCapability } from "./renderCapability";
import { expandWorkingSet } from "./workingSet";

interface StageSceneDashboardIntent {
  descendFeatureTag: (featureTag: unknown) => Promise<unknown>;
  setRepresentationMode: (mode: unknown) => Promise<unknown>;
}
type SceneOriginMarker = (originated?: boolean) => void;

type StageContextMenuEvent = Extract<SceneEvent, { kind: "context-menu" }>;
type StageRepresentationEvent = Extract<
  SceneEvent,
  { kind: "representation-mode-changed" }
>;

export interface StageSceneEventContext {
  scope: string | null;
  activeRepresentationMode: RepresentationMode;
  stageSceneIntent: StageSceneDashboardIntent;
  markSceneOriginated?: SceneOriginMarker;
}

export interface StageContextMenuIntent {
  entity: EntityDescriptor;
  anchor: MenuAnchor;
}

export function stageContextMenuIntent(
  event: StageContextMenuEvent,
  scope: string | null,
): StageContextMenuIntent {
  const anchor = { x: event.clientX, y: event.clientY };
  // Right-click on an EDGE routes to the edge resolver (highlight / copy / goto-
  // destination); the scene only reports the edge id, so relation/dst/tier render
  // disabled-with-reason. A right-click on a NODE builds the node entity, and an
  // empty-canvas gesture (no id) falls through to the canvas menu.
  if (event.id && event.target === "edge") {
    return { anchor, entity: { kind: "edge", id: event.id } };
  }
  const nodeEntity = event.id ? nodeEntityView({ id: event.id, scope }) : null;
  return {
    anchor,
    entity: nodeEntity ?? { kind: "canvas", id: "canvas" },
  };
}

export function shouldSyncAppliedRepresentationMode(
  event: StageRepresentationEvent,
  activeRepresentationMode: RepresentationMode,
  scope: string | null,
): boolean {
  return event.applied !== activeRepresentationMode && scope !== null;
}

export function handleStageSceneEvent(
  event: SceneEvent,
  context: StageSceneEventContext,
): void {
  if (event.kind === "hover") {
    setHoveredNodeId(event.id);
    return;
  }

  if (event.kind === "open") {
    // DOUBLE-CLICK routes through the ONE canonical activate seam: selection + a
    // PERMANENT dock tab (VS Code double-click pegs; the `select` bridge does the
    // provisional preview). `frame:false` — the node is already on screen where the
    // user double-clicked, so the camera must not yank. A synthesized `feature:` node
    // has no document → it DESCENDS via the supplied intent (no tab). This RETIRES the
    // dead on-canvas island open (openGraphNodeFromScene/openNode). The selection is
    // scene-originated, so the dashboard→scene projection skips the focus bounce.
    context.markSceneOriginated?.(true);
    void activateEntity(event.id, context.scope, {
      permanent: true,
      frame: false,
      featureDescent: context.stageSceneIntent,
    }).catch(() => undefined);
    return;
  }

  if (event.kind === "expand") {
    expandWorkingSet(event.id);
    return;
  }

  if (event.kind === "context-menu") {
    const intent = stageContextMenuIntent(event, context.scope);
    openContextMenu(intent.entity, intent.anchor);
    return;
  }

  if (event.kind === "render-capability") {
    setRenderCapability(event);
    return;
  }

  if (event.kind === "representation-mode-changed") {
    if (
      shouldSyncAppliedRepresentationMode(
        event,
        context.activeRepresentationMode,
        context.scope,
      )
    ) {
      void context.stageSceneIntent
        .setRepresentationMode(event.applied)
        .catch(() => undefined);
    }
  }
}
