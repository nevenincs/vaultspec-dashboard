import { type CSSProperties, useEffect, useRef, useState } from "react";

import { nodeCategory, type NodeCategory } from "../../scene/field/categoryColor";
import {
  nodeStatusFromWire,
  stampFor,
  type NodeStatus,
} from "../../scene/field/statusStamp";
import type { EngineNode } from "../server/engine";
import { deriveTypeContent, type TypeCardContent } from "./hoverCardContent";

export interface StatusCardModel {
  /** Stable node id (identity-bearing; rendered monospace). */
  readonly id: string;
  /** GLYPH_KINDS species (adr / plan / audit / rule / feature / ...). */
  readonly kind: string;
  readonly title: string;
  readonly status?: NodeStatus;
  /** A coarse authority label for the microline (e.g. "accepted decision"). */
  readonly authorityClass?: string;
  /** Rollout progress (plan/feature) — the separate channel, a bar not a stamp. */
  readonly progress?: { done: number; total: number };
  /** The scene category the node belongs to; drives tokenized accent styling. */
  readonly category?: NodeCategory;
  /** The type-specific content block. */
  readonly typeContent?: TypeCardContent;
}

export interface StatusCardProjectionInput {
  readonly status?: NodeStatus;
  readonly authorityClass?: string;
  readonly progress?: { done: number; total: number };
}

export interface StatusCardRolloutView {
  readonly done: number;
  readonly total: number;
  readonly label: string;
  readonly width: string;
}

export interface StatusCardPresentationView {
  readonly rollout: StatusCardRolloutView | null;
  readonly microline: string | null;
}

export interface StatusCardBloomMotionView {
  readonly motion: "bloom" | "crossfade";
  readonly reducedMotion: boolean;
  readonly style: CSSProperties;
}

export function statusCardRolloutView(
  progress: StatusCardProjectionInput["progress"],
): StatusCardRolloutView | null {
  if (!progress || progress.total <= 0) return null;
  const fraction = Math.max(0, Math.min(1, progress.done / progress.total));
  return {
    done: progress.done,
    total: progress.total,
    label: `${progress.done}/${progress.total}`,
    width: `${Math.round(fraction * 100)}%`,
  };
}

function statusMagnitudeLabel(status: NodeStatus | undefined): string | null {
  if (!status) return null;
  const stamp = stampFor(status);
  if (stamp.severityDot) return `severity ${stamp.severityDot}/4`;
  if (stamp.tierNotch) return `tier ${stamp.tierNotch}/4`;
  return null;
}

export function deriveStatusCardPresentationView(
  input: StatusCardProjectionInput,
): StatusCardPresentationView {
  const microline = [input.authorityClass, statusMagnitudeLabel(input.status)]
    .filter(Boolean)
    .join(" · ");
  return {
    rollout: statusCardRolloutView(input.progress),
    microline: microline.length > 0 ? microline : null,
  };
}

export function deriveStatusCardBloomMotionView(
  reducedMotion: boolean,
  bloomed: boolean,
): StatusCardBloomMotionView {
  if (reducedMotion) {
    return {
      motion: "crossfade",
      reducedMotion: true,
      style: {
        opacity: bloomed ? 1 : 0,
        transition: "opacity var(--duration-ui-fast, 150ms) var(--ease-settle)",
      },
    };
  }
  return {
    motion: "bloom",
    reducedMotion: false,
    style: {
      opacity: bloomed ? 1 : 0,
      transform: bloomed ? "scale(1)" : "scale(0.92)",
      transformOrigin: "top left",
      transition:
        "opacity 180ms var(--ease-settle, ease-out), transform 180ms var(--ease-settle, ease-out)",
    },
  };
}

export function useStatusCardBloomMotionView(
  reducedMotion: boolean,
): StatusCardBloomMotionView {
  const [bloomed, setBloomed] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(() => setBloomed(true));
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return deriveStatusCardBloomMotionView(reducedMotion, bloomed);
}

export function statusCardModelFromNode(node: EngineNode): StatusCardModel {
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
    category: nodeCategory(node.kind),
    typeContent: deriveTypeContent(node),
  };
}
