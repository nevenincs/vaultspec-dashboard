// Hover ego-highlight (W02.P06.S22, ADR G3.b): the hovered node and its
// 1-hop neighborhood lift; the rest of the field recedes — dims, doesn't
// hide. DOI label culling rides the same set: lifted nodes show their
// labels at any zoom. Scene-layer module: framework-free.

import type { SceneGraphModel } from "../graphModel";

export interface EgoSet {
  nodeIds: ReadonlySet<string>;
  edgeIds: ReadonlySet<string>;
}

/** Alpha multiplier for the receded field while an ego is lifted. */
export const RECEDE_ALPHA = 0.22;

/** The hovered node, its 1-hop neighbors, and the incident edges. */
export function computeEgo(model: SceneGraphModel, id: string): EgoSet {
  const nodeIds = new Set<string>([id]);
  for (const neighbor of model.neighborsOf(id)) {
    nodeIds.add(neighbor);
  }
  return { nodeIds, edgeIds: new Set(model.edgesOf(id)) };
}

// --- SELECTED-state ring alpha (graph/Node-items 83:2 "selected") --------------
//
// The binding "selected" state is the SINGLE persistent accent: a selected node's
// concentric accent ring is the one always-legible selection signal, so it must
// never dissolve into the receded field the way a body does. When an ego is held
// (a hover lifts a node + its neighbours and recedes the rest), a SELECTED node
// that is itself lifted keeps a full-strength ring; a selected node that is NOT in
// the ego still reads at a legibility FLOOR — dimmer than the lifted ego, but well
// above the body recede, so the user never loses where their selection is. With no
// ego held, the ring is always full. This is the inbound `set-selected` state's
// alpha policy; it composes with (does not fight) the ego recede the body follows.

/** The floor a selected ring dims to when its node is outside a held ego — bright
 *  enough to stay legible, below the lifted-ego full strength. */
export const SELECTED_RING_RECEDE_FLOOR = 0.55;

/**
 * Resolve a selected node's accent-ring alpha. `egoHeld` is true while a hover
 * ego lifts part of the field; `lifted` is true when THIS selected node is in the
 * lifted set. The ring is full when no ego is held or when this node is lifted,
 * and otherwise holds the legibility floor (never the body's deep recede) so the
 * selection stays visible against a receded field.
 */
export function selectedRingAlpha(egoHeld: boolean, lifted: boolean): number {
  if (!egoHeld || lifted) return 1;
  return SELECTED_RING_RECEDE_FLOOR;
}
