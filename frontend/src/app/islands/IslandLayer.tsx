// React island layer (W01.P04.S15, ADR G6.a).
//
// Opened nodes render as DOM islands above the GPU field — full HTML
// richness where it matters, GPU economy everywhere else. Each island
// subscribes to its node's screen-space anchor through the seam's
// `trackNode`; React receives anchor CHANGES only (the AnchorDriver
// epsilon-gates dispatch), never per-frame state. The island's content is
// rendered by the open-in-place `NodeInterior` (W02.P06.S24, landed).

import { X } from "lucide-react";
import type { ReactNode } from "react";

import type { SceneController } from "../../scene/sceneController";
import { openContextMenu } from "../../stores/view/contextMenu";
import { islandStyle, useNodeAnchor } from "../../stores/view/islandAnchors";
import { closeNodeIsland, useOpenedNodeIslands } from "../../stores/view/selection";
import { NodeInterior } from "./NodeInterior";

interface IslandProps {
  scene: SceneController;
  id: string;
  scope: string | null;
  children?: ReactNode;
}

function Island({ scene, id, scope, children }: IslandProps) {
  const anchor = useNodeAnchor(scene, id);
  return (
    <div
      style={islandStyle(anchor)}
      className="pointer-events-auto rounded-fg-md border border-rule bg-paper-raised/95 p-fg-2 text-body shadow-fg-overlay"
      data-island-for={id}
      onContextMenu={(e) => {
        e.preventDefault();
        openContextMenu({ kind: "island", id, scope }, { x: e.clientX, y: e.clientY });
      }}
    >
      <div className="flex items-center justify-between gap-fg-2">
        {/* The opened node's id is true identity → monospace (typography law). */}
        <span className="truncate font-mono text-label text-ink">{id}</span>
        <button
          type="button"
          aria-label={`Close ${id}`}
          className="shrink-0 text-ink-faint transition-colors duration-ui-fast hover:text-ink"
          onClick={() => closeNodeIsland(id)}
        >
          <X aria-hidden size={14} strokeWidth={1.5} />
        </button>
      </div>
      {children ?? <NodeInterior id={id} scope={scope} />}
    </div>
  );
}

export interface IslandLayerProps {
  scene: SceneController;
  scope?: string | null;
}

/**
 * The overlay layer: absolutely positioned above the stage canvas,
 * transparent to pointer events except over the islands themselves.
 */
export function IslandLayer({ scene, scope = null }: IslandLayerProps) {
  const openedIds = useOpenedNodeIslands();
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {openedIds.map((id) => (
        <Island key={id} scene={scene} id={id} scope={scope} />
      ))}
    </div>
  );
}
