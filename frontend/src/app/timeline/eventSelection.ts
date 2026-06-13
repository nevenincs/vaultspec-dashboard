// Event-mark selection (W02.P08.S36, ADR G2.b; contract §5 event shape).
//
// Clicking a timeline event mark selects it through the one shared
// selection (the inspector shows the commit/doc event, S42) and pulses the
// corresponding nodes on the stage — the event's `node_ids` field is
// load-bearing: timeline and stage join on it.

import type { SceneController } from "../../scene/sceneController";
import type { EngineEvent } from "../../stores/server/engine";
import { selectEvent } from "../../stores/view/selection";
import { getScene } from "../stage/Stage";

export function handleEventClick(
  event: EngineEvent,
  scene: SceneController = getScene().controller,
): void {
  // node_ids is bounded (contract §5, cap 20): pulse what's carried; the
  // truncation count rides the selection so the inspector surfaces it
  // honestly — a silent partial pulse would violate the truthfulness
  // stance.
  selectEvent(event.id, event.node_ids, event.truncated_node_ids);
  if (event.node_ids.length > 0) {
    scene.command({ kind: "pulse", ids: new Set(event.node_ids) });
  }
}
