// Hover-card island host (figma-parity-reconciliation W03.P08.S50; binding
// graph/HoverCard 84:2). HIGH-1 reconciliation: this host now mounts the ONE
// canonical hover card — the binding evidence-driven `menus/HoverCard` — into the
// LIVE canvas hover path, retiring the old typed `islands/HoverCard` rung. There
// is one hover card on canvas hover.
//
// The THIRD LOD rung between the far glyph (the scene stamp) and the heavyweight
// opened-interior island: a transient, lighter DOM-island variety that blooms
// over a node on hover-dwell. It mounts the binding `menus/HoverCard`, anchored
// through the SAME seam `trackNode` mechanism the opened island uses, so it rides
// the camera with the node it describes. The host owns the THREE separations the
// ADR mandates:
//
//   - hover bloom vs focus pin vs open: hovering writes canonical dashboard hover
//     only (never selection, never the opened set); the card is inspect-only
//     (pointer-events none) so it cannot steal the pointer or flicker, while its
//     open affordance fires the existing open intent through `onOpen`;
//   - a ~150ms DWELL before the card shows, so a glancing pass over a node does
//     not flash a card; cleared instantly on hover-out (dashboard hover → null);
//   - OPEN SUPPRESSION: a node already opened as a full interior renders no hover
//     card — the heavyweight island already shows everything the card would.
//
// Content is a DUMB PROJECTION (dashboard-layer-ownership,
// views-are-projections-of-one-model): the card is fed through the stores-owned
// `useHoverCardView` selector. This host owns anchoring, dwell and open intent;
// query payload interpretation and evidence folding stay out of the app layer.

import type { SceneController } from "../../scene/sceneController";
import {
  deriveHoverCardLayerView,
  useHoverCardView,
} from "../../stores/view/hoverCard";
import {
  useDwelledHoverNodeId,
  openNodeIsland,
  useHoveredNodeId,
  useOpenedNodeIslands,
} from "../../stores/view/selection";
import { islandStyle, useNodeAnchor } from "../../stores/view/islandAnchors";
import { HoverCard } from "../right/menus/HoverCard";

interface HoverCardIslandProps {
  scene: SceneController;
  id: string;
  scope: unknown;
  cardShellClassName: string;
}

/** One hovered node's transient card: anchored to the node, inspect-only. */
function HoverCardIsland({
  scene,
  id,
  scope,
  cardShellClassName,
}: HoverCardIslandProps) {
  const anchor = useNodeAnchor(scene, id);
  const hoverCard = useHoverCardView(id, scope);
  // The node off stage (no anchor) or with no identity yet: render nothing rather
  // than a floating empty card. The dwell already guards the flash. Evidence may
  // still be in flight — the card then shows identity only and fills in on settle.
  if (!anchor || hoverCard.model === null) return null;
  return (
    <div style={islandStyle(anchor)} data-hover-card-for={id}>
      {/* The pure-hover card is INSPECT-ONLY (pointer-events none on the wrapper)
            so it never steals the pointer and flickers the hover off the node.
            The open affordance is the ONE interactive escape: it re-enables pointer
            events on itself via the inner button, and fires the existing open
            intent (the same path a double-click/open uses) — bloom → open. */}
      <div className={cardShellClassName}>
        <HoverCard
          model={hoverCard.model}
          onOpen={(openId) => {
            void openNodeIsland(openId, scope).catch(() => undefined);
          }}
        />
      </div>
    </div>
  );
}

export interface HoverCardLayerProps {
  scene: SceneController;
  scope?: unknown;
}

/**
 * The hover-card overlay: a sibling of `IslandLayer`, transparent to pointer
 * events. Keys off the dwelled hovered id, suppressed when that id is opened, so
 * the transient card and the opened interior never coexist for one node.
 */
export function HoverCardLayer({ scene, scope = null }: HoverCardLayerProps) {
  const hoveredId = useHoveredNodeId();
  const openedIds = useOpenedNodeIslands();
  const dwelledId = useDwelledHoverNodeId(hoveredId);
  const view = deriveHoverCardLayerView(dwelledId, openedIds);
  return (
    <div className={view.rootClassName} data-hover-card-layer>
      {view.targetId !== null && (
        // Key on the id so a hover moving from one node to another remounts the
        // card (a fresh bloom from the new glyph), never re-tweens across nodes.
        <HoverCardIsland
          key={view.targetId}
          scene={scene}
          id={view.targetId}
          scope={scope}
          cardShellClassName={view.cardShellClassName}
        />
      )}
    </div>
  );
}
