// React island layer (W01.P04.S15, ADR G6.a).
//
// Opened nodes render as DOM islands above the GPU field — full HTML
// richness where it matters, GPU economy everywhere else. Each island
// subscribes to its node's screen-space anchor through the seam's
// `trackNode`; React receives anchor CHANGES only (the AnchorDriver
// epsilon-gates dispatch), never per-frame state. The island's content is
// a placeholder shell until the open-in-place interiors land (W02.P06.S24).

import { X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";

import type { SceneAnchor, SceneController } from "../../scene/sceneController";
import { openContextMenu } from "../../stores/view/contextMenu";
import { useViewStore } from "../../stores/view/viewStore";
import { NodeInterior } from "./NodeInterior";

/** Island base size in CSS px at camera scale 1. */
export const ISLAND_WIDTH_PX = 260;
/** Islands scale with the field but stay readable: clamp the CSS scale. */
export const ISLAND_MIN_SCALE = 0.75;
export const ISLAND_MAX_SCALE = 1.25;

/** Pure style computation from an anchor — unit-testable without DOM. */
export function islandStyle(anchor: SceneAnchor | null): CSSProperties {
  if (!anchor) return { display: "none" };
  const scale = Math.max(ISLAND_MIN_SCALE, Math.min(ISLAND_MAX_SCALE, anchor.scale));
  return {
    position: "absolute",
    left: 0,
    top: 0,
    width: `${ISLAND_WIDTH_PX}px`,
    transform: `translate(${anchor.x}px, ${anchor.y}px) scale(${scale})`,
    transformOrigin: "top left",
  };
}

/** Subscribe to one node's screen anchor through the seam (RL-4). */
export function useNodeAnchor(scene: SceneController, id: string): SceneAnchor | null {
  const [anchor, setAnchor] = useState<SceneAnchor | null>(null);
  useEffect(() => {
    setAnchor(null);
    return scene.trackNode(id, setAnchor);
  }, [scene, id]);
  return anchor;
}

interface IslandProps {
  scene: SceneController;
  id: string;
  children?: ReactNode;
}

function Island({ scene, id, children }: IslandProps) {
  const anchor = useNodeAnchor(scene, id);
  const closeNode = useViewStore((s) => s.closeNode);
  return (
    <div
      style={islandStyle(anchor)}
      className="pointer-events-auto rounded-vs-md border border-rule bg-paper-raised/95 p-vs-2 text-body shadow-float"
      data-island-for={id}
      onContextMenu={(e) => {
        e.preventDefault();
        openContextMenu({ kind: "island", id }, { x: e.clientX, y: e.clientY });
      }}
    >
      <div className="flex items-center justify-between gap-vs-2">
        {/* The opened node's id is true identity → monospace (typography law). */}
        <span className="truncate font-mono text-label text-ink">{id}</span>
        <button
          type="button"
          aria-label={`Close ${id}`}
          className="shrink-0 text-ink-faint transition-colors duration-ui-fast hover:text-ink"
          onClick={() => closeNode(id)}
        >
          <X aria-hidden size={14} strokeWidth={1.5} />
        </button>
      </div>
      {children ?? <NodeInterior id={id} />}
    </div>
  );
}

export interface IslandLayerProps {
  scene: SceneController;
}

/**
 * The overlay layer: absolutely positioned above the stage canvas,
 * transparent to pointer events except over the islands themselves.
 */
export function IslandLayer({ scene }: IslandLayerProps) {
  const openedIds = useViewStore((s) => s.openedIds);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {openedIds.map((id) => (
        <Island key={id} scene={scene} id={id} />
      ))}
    </div>
  );
}
