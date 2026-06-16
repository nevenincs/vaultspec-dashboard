// Hover-card island host (node-visual-richness P04.S15/S16, ADR P04).
//
// The THIRD LOD rung between the far glyph (the scene stamp) and the heavyweight
// opened-interior island: a transient, lighter DOM-island variety that blooms
// over a node on hover-dwell. It mounts the self-contained `HoverCard`, anchored
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
// Content is a COMPACT projection fed entirely through a stores hook
// (`useNodeDetail`) — the card never fetches and never reads the raw `tiers`
// block (dashboard-layer-ownership). Motion + reduced-motion live inside the
// `HoverCard` itself (the bloom grows from the glyph anchor).

import { useEffect, useState } from "react";

import { nodeCategory } from "../../scene/field/categoryColor";
import type { EngineNode, PlanInterior } from "../../stores/server/engine";
import { nodeStatusFromWire } from "../../scene/field/statusStamp";
import type { SceneController } from "../../scene/sceneController";
import { usePlanInterior, useNodeDetail } from "../../stores/server/queries";
import { useViewStore } from "../../stores/view/viewStore";
import { HoverCard, type StatusCardModel } from "./HoverCard";
import { deriveTypeContent } from "./hoverCardContent";
import { islandStyle, useNodeAnchor } from "./IslandLayer";

/** Dwell before the hover card blooms (ms): a glancing pass shows nothing. */
export const HOVER_DWELL_MS = 150;

/**
 * Project an engine node into the compact card view model (pure, unit-tested).
 * The status object is derived through the SAME scene util the stamp uses, so the
 * card and the canvas stamp read one truth; the rollout bar is fed only when the
 * node carries lifecycle progress (plan/feature), the SEPARATE channel.
 */
export function cardModelFromNode(
  node: EngineNode,
  opts: { interior?: PlanInterior; gitDirty?: boolean } = {},
): StatusCardModel {
  const progress = node.lifecycle?.progress;
  return {
    id: node.id,
    kind: node.kind,
    title: node.title ?? node.id,
    status: nodeStatusFromWire(node.status_value, node.status_class),
    authorityClass: node.authority_class,
    progress:
      progress && progress.total > 0
        ? { done: progress.done, total: progress.total }
        : undefined,
    // The scene category (the type channel) drives the accent strip + header
    // hue; the typed content plane carries the per-type facts derived purely
    // from the wire (node-hover-typed-card; views-are-projections-of-one-model).
    category: nodeCategory(node.kind),
    typeContent: deriveTypeContent(node, {
      interior: opts.interior,
      gitDirty: opts.gitDirty,
    }),
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
  // For a plan node, lean on the SAME cached bounded plan-interior the Work
  // step-tree already fetches (no second route, no new backend) to derive the
  // "phases left" count; disabled for every non-plan node so the card never
  // mints an interior fetch it cannot use (graph-queries-are-bounded-by-default).
  const isPlan = detail.data?.node.kind === "plan";
  const interior = usePlanInterior(isPlan ? id : null);
  // The node off stage (no anchor) or with no detail yet: render nothing rather
  // than a floating empty card. The dwell already guards the flash.
  if (!anchor || !detail.data) return null;
  const model = cardModelFromNode(detail.data.node, {
    interior: interior.data?.interior,
  });
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
