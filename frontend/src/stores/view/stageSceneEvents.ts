// Stage scene-event bridge. The scene reports gestures and renderer echoes; this
// stores/view seam translates them into shared state intents so Stage does not
// re-implement hover, open, expansion, context-menu, or applied-mode decisions.

import type { SceneEvent } from "../../scene/sceneController";
import type { RepresentationMode } from "../../scene/field/representationLayout";
import type { EntityDescriptor } from "../../platform/actions/entity";
import { openContextMenu, type MenuAnchor } from "./contextMenu";
import { nodeEntityView } from "./nodeEntity";
import { openGraphNodeFromScene, setHoveredNodeId } from "./selection";
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
    void openGraphNodeFromScene(
      event.id,
      context.scope,
      context.stageSceneIntent,
      context.markSceneOriginated,
    ).catch(() => undefined);
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
