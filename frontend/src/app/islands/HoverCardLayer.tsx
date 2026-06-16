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
//   - hover bloom vs focus pin vs open: hovering sets `hoveredId` only (never
//     selection, never the opened set); the card is inspect-only (pointer-events
//     none) so it cannot steal the pointer or flicker, while its open affordance
//     fires the existing open intent through `onOpen`;
//   - a ~150ms DWELL before the card shows, so a glancing pass over a node does
//     not flash a card; cleared instantly on hover-out (hoveredId → null);
//   - OPEN SUPPRESSION: a node already opened as a full interior renders no hover
//     card — the heavyweight island already shows everything the card would.
//
// Content is a DUMB PROJECTION (dashboard-layer-ownership,
// views-are-projections-of-one-model): the card is fed entirely through stores
// hooks — identity (kind / title / category) from `useNodeDetail` and the ENRICHED
// evidence groups (documents / code / commits) from `useNodeEvidence` — folded by
// the pure `deriveEvidenceGroups` seam. The card never fetches and never reads the
// raw `tiers` block. Motion + reduced-motion live in the island wrapper's bloom.

import { useEffect, useState } from "react";

import { nodeCategory } from "../../scene/field/categoryColor";
import type { EngineNode, NodeEvidence } from "../../stores/server/engine";
import type { SceneController } from "../../scene/sceneController";
import { useNodeDetail, useNodeEvidence } from "../../stores/server/queries";
import { useViewStore } from "../../stores/view/viewStore";
import { HoverCard, type HoverCardModel } from "../right/menus/HoverCard";
import { deriveEvidenceGroups } from "../right/menus/hoverCardEvidence";
import { islandStyle, useNodeAnchor } from "./IslandLayer";

/** Dwell before the hover card blooms (ms): a glancing pass shows nothing. */
export const HOVER_DWELL_MS = 150;

/**
 * Project a node's identity plus its enriched evidence into the binding card's
 * view model (pure, unit-tested). Identity (kind / title / category) comes from
 * the node detail; the bounded grouped evidence is folded from the node-evidence
 * query by the pure `deriveEvidenceGroups` seam. When evidence is absent the card
 * renders identity only (the fold returns no groups).
 */
export function cardModelFromEvidence(
  node: EngineNode,
  evidence: NodeEvidence | undefined,
): HoverCardModel {
  return {
    id: node.id,
    kind: node.kind,
    title: node.title ?? node.id,
    // The scene category (the type channel) drives the accent strip + header hue;
    // the same scene util the canvas stamp uses, so card and canvas read one truth.
    category: nodeCategory(node.kind),
    evidence: evidence ? deriveEvidenceGroups(evidence) : [],
  };
}

/**
 * Gate a raw hovered id behind a dwell, then suppress it if it is opened.
 * Returns the id the card should mount for, or null. Pure so the dwell→suppress
 * sequencing is unit-testable without timers in the host.
 */
export function resolveHoverTarget(
  dwelledId: string | null,
  openedIds: readonly string[],
): string | null {
  if (dwelledId === null) return null;
  // OPEN SUPPRESSION: the full interior already shows everything the card would.
  if (openedIds.includes(dwelledId)) return null;
  return dwelledId;
}

/** Hold the hovered id only after it has survived the dwell; clear instantly on
 *  hover-out so the card dismisses without a trailing delay. */
function useDwelledHoverId(hoveredId: string | null): string | null {
  const [dwelledId, setDwelledId] = useState<string | null>(null);
  useEffect(() => {
    if (hoveredId === null) {
      // Hover-out dismisses immediately — no dwell on the way down.
      setDwelledId(null);
      return;
    }
    const timer = setTimeout(() => setDwelledId(hoveredId), HOVER_DWELL_MS);
    return () => clearTimeout(timer);
  }, [hoveredId]);
  return dwelledId;
}

interface HoverCardIslandProps {
  scene: SceneController;
  id: string;
}

/** One hovered node's transient card: anchored to the node, inspect-only. */
function HoverCardIsland({ scene, id }: HoverCardIslandProps) {
  const anchor = useNodeAnchor(scene, id);
  const openNode = useViewStore((s) => s.openNode);
  const detail = useNodeDetail(id);
  // The enriched node-evidence: documents / code / commits with resolution state
  // (the binding card's body). The single wire seam is the stores hook; the card
  // never fetches and never reads raw `tiers` (dashboard-layer-ownership).
  const evidence = useNodeEvidence(id);
  // The node off stage (no anchor) or with no identity yet: render nothing rather
  // than a floating empty card. The dwell already guards the flash. Evidence may
  // still be in flight — the card then shows identity only and fills in on settle.
  if (!anchor || !detail.data) return null;
  const model = cardModelFromEvidence(detail.data.node, evidence.data);
  return (
    <div style={islandStyle(anchor)} data-hover-card-for={id}>
      {/* The pure-hover card is INSPECT-ONLY (pointer-events none on the wrapper)
          so it never steals the pointer and flickers the hover off the node.
          The open affordance is the ONE interactive escape: it re-enables pointer
          events on itself via the inner button, and fires the existing open
          intent (the same path a double-click/open uses) — bloom → open. */}
      <div className="pointer-events-none">
        <HoverCard model={model} onOpen={(openId) => openNode(openId)} />
      </div>
    </div>
  );
}

export interface HoverCardLayerProps {
  scene: SceneController;
}

/**
 * The hover-card overlay: a sibling of `IslandLayer`, transparent to pointer
 * events. Keys off the dwelled hovered id, suppressed when that id is opened, so
 * the transient card and the opened interior never coexist for one node.
 */
export function HoverCardLayer({ scene }: HoverCardLayerProps) {
  const hoveredId = useViewStore((s) => s.hoveredId);
  const openedIds = useViewStore((s) => s.openedIds);
  const dwelledId = useDwelledHoverId(hoveredId);
  const targetId = resolveHoverTarget(dwelledId, openedIds);
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      data-hover-card-layer
    >
      {targetId !== null && (
        // Key on the id so a hover moving from one node to another remounts the
        // card (a fresh bloom from the new glyph), never re-tweens across nodes.
        <HoverCardIsland key={targetId} scene={scene} id={targetId} />
      )}
    </div>
  );
}
