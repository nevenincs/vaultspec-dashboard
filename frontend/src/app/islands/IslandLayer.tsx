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
import { useGraphNodeFromActiveSlice } from "../../stores/server/queries";
import { nodeInteriorAuthoredTitle } from "../../stores/view/nodeInterior";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { guardedContextMenu } from "../menus/guardedContextMenu";
import { RowMenuDisclosure } from "../chrome/RowMenuDisclosure";
import { openContextMenu } from "../../stores/view/contextMenu";
import { islandStyle, useNodeAnchor } from "../../stores/view/islandAnchors";
import { closeNodeIsland, useOpenedNodeIslands } from "../../stores/view/selection";
import { NodeInterior } from "./NodeInterior";

/** Elements inside an island that own their own click semantics (the close
 *  button, interior chips and links); a right-click on these is NOT an island
 *  click, so the island menu no longer blankets nested targets
 *  (touch-selectability ADR D1: the island gains the same target scoping the
 *  rail and timeline background handlers already have). */
const ISLAND_NON_MENU_SELECTOR = "button,a,input,textarea,select";

export function isIslandMenuTarget(event: { target: unknown }): boolean {
  const target = event.target as Element | null;
  if (target === null || typeof target.closest !== "function") return false;
  return target.closest(ISLAND_NON_MENU_SELECTOR) === null;
}

interface IslandProps {
  scene: SceneController;
  id: string;
  scope: string | null;
  children?: ReactNode;
}

function Island({ scene, id, scope, children }: IslandProps) {
  const anchor = useNodeAnchor(scene, id);
  const resolveMessage = useLocalizedMessageResolver();
  const node = useGraphNodeFromActiveSlice(id, scope);
  const displayTitle =
    (node === null ? null : nodeInteriorAuthoredTitle(node)) ??
    resolveMessage({ key: "graph:labels.item" }).message;
  const islandEntity = { kind: "island" as const, id, scope };
  return (
    <div
      style={islandStyle(anchor)}
      className="pointer-events-auto rounded-fg-md border border-rule bg-paper-raised/95 p-fg-2 text-body shadow-fg-overlay"
      data-island-for={id}
      onContextMenu={guardedContextMenu((e) => {
        if (!isIslandMenuTarget(e)) return;
        e.preventDefault();
        openContextMenu(islandEntity, { x: e.clientX, y: e.clientY });
      })}
    >
      <div className="flex items-center justify-between gap-fg-2">
        <span className="truncate text-label text-ink">{displayTitle}</span>
        <RowMenuDisclosure
          entity={islandEntity}
          label={
            resolveMessage({
              key: "common:accessibility.actionsForItem",
              values: { item: displayTitle },
            }).message
          }
        />
        <button
          type="button"
          aria-label={resolveMessage({ key: "common:actions.close" }).message}
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
