// Shared vaultspec-core-derived action builders (the ONE uniform source the
// unified action plane requires). The relate and archive verbs recur across many
// surfaces — the vault-doc row, the graph node, the timeline event — so they are
// authored ONCE here and every surface's resolver composes them, rather than each
// re-deriving the dispatch payload and the disabled-state logic. A label/effect or
// backend-verb change lands in one place and every surface inherits it.
//
// App layer: these build `ActionDescriptor`s that dispatch through the ONE ops
// seam (OPS_ACTION → appDispatcher → engine /ops/core/*). They read only their
// arguments + the injected ActionContext (selectedNodeId), never a store — so they
// stay pure and unit-testable.

import { Archive, ArrowUpRight, Link2 } from "lucide-react";

import type { ActionDescriptor } from "../../platform/actions/action";
import type { ActionContext } from "../../platform/actions/registry";
import { OPS_ACTION } from "../../stores/server/opsActions";
import { openMenuNodeIsland } from "../../stores/view/menuActions";

const DOC_NODE_PREFIX = "doc:";

export interface OpenEntityOptions {
  /** The action id (surface-scoped, e.g. "search-result:open" / "node:open"). */
  id: string;
  /** The graph node id the entity resolves to, or null/absent when it has none. */
  nodeId?: string | null;
  /** The active scope, forwarded to the open seam. */
  scope?: string | null;
  /** Override the label (defaults to "Open"). */
  label?: string;
  /** Reason shown when the entity has no node to open. */
  disabledReason?: string;
}

/**
 * "Open": open a result entity on the stage — the ONE standardized open verb every
 * edge composes (the command-palette-planes ADR's "one open verb for every result
 * entity"). It runs the canonical selection seam (`openMenuNodeIsland` →
 * `openNodeIsland`: select + open the island + recenter), so opening a document- or
 * semantic-search hit, a graph node, or a context-menu target is literally the same
 * verb. A non-mutating navigation (no time-travel gate). Disabled-with-reason when
 * the entity carries no graph node to open.
 */
export function openEntityAction(opts: OpenEntityOptions): ActionDescriptor {
  const base = {
    id: opts.id,
    label: opts.label ?? "Open",
    section: "navigate" as const,
    icon: ArrowUpRight,
  };
  const nodeId =
    typeof opts.nodeId === "string" && opts.nodeId.trim().length > 0
      ? opts.nodeId.trim()
      : null;
  if (nodeId === null) {
    return {
      ...base,
      disabled: true,
      disabledReason: opts.disabledReason ?? "nothing to open",
    };
  }
  return {
    ...base,
    run: () => openMenuNodeIsland(nodeId, { scope: opts.scope ?? undefined }),
  };
}

/** The document stem a `doc:<stem>` node id names, or null for a non-document node. */
export function docStemFromNodeId(nodeId: string | null | undefined): string | null {
  if (typeof nodeId !== "string" || !nodeId.startsWith(DOC_NODE_PREFIX)) return null;
  const stem = nodeId.slice(DOC_NODE_PREFIX.length).trim();
  return stem.length > 0 ? stem : null;
}

export interface RelateToSelectionOptions {
  /** The action id (surface-scoped, e.g. "vault-doc:relate" / "node:relate"). */
  id: string;
  /** The source document stem, or null when the source is not a relatable
   *  document (renders disabled-with-reason). */
  srcStem: string | null;
  /** The active scope, forwarded to the link op. */
  scope?: string | null;
  /** The resolver context carrying the current `selectedNodeId` (the relate target). */
  ctx?: ActionContext;
  /** Reason shown when the source itself is not a document (node surfaces). */
  notADocumentReason?: string;
}

/**
 * "Relate to focused node": add a `related:` edge from a source document to the
 * currently selected document (`vault link add`), routed through the ops seam. A
 * pure derived-state consumer — it reads the target from `ctx.selectedNodeId` and
 * renders disabled-with-reason when there is no focused document, the source/focus
 * is not a document, or the focus is the same document. Mutating → `disabledInTimeTravel`.
 */
export function relateToSelectionAction(
  opts: RelateToSelectionOptions,
): ActionDescriptor {
  const base = {
    id: opts.id,
    label: "Relate to focused node",
    section: "transform" as const,
    icon: Link2,
    disabledInTimeTravel: true,
  };
  if (opts.srcStem === null) {
    return {
      ...base,
      disabled: true,
      disabledReason: opts.notADocumentReason ?? "not a document",
    };
  }
  const dstStem = docStemFromNodeId(opts.ctx?.selectedNodeId ?? null);
  if (dstStem === null) {
    return { ...base, disabled: true, disabledReason: "focus a document to relate to" };
  }
  if (dstStem === opts.srcStem) {
    return { ...base, disabled: true, disabledReason: "already this document" };
  }
  return {
    ...base,
    dispatch: {
      type: OPS_ACTION,
      payload: {
        target: "core",
        verb: "link-add",
        mode: "link",
        body: { scope: opts.scope ?? undefined, src: opts.srcStem, dst: dstStem },
      },
    },
  };
}

export interface ArchiveFeatureOptions {
  /** The action id (surface-scoped). */
  id: string;
  /** The feature tag to archive, or null when it cannot be derived (disabled). */
  feature: string | null;
  scope?: string | null;
}

/**
 * "Archive feature": retire a completed feature's documents (`vault feature
 * archive`), routed through the ops seam. Destructive → carries `confirm` (the
 * menu/palette arm-to-confirm guard) and `disabledInTimeTravel`. Disabled-with-
 * reason when the feature cannot be derived.
 */
export function archiveFeatureAction(opts: ArchiveFeatureOptions): ActionDescriptor {
  const base = {
    id: opts.id,
    label: opts.feature ? `Archive feature “${opts.feature}”` : "Archive feature",
    section: "danger" as const,
    icon: Archive,
    confirm: true,
    disabledInTimeTravel: true,
  };
  if (opts.feature === null) {
    return { ...base, disabled: true, disabledReason: "no feature to archive" };
  }
  return {
    ...base,
    dispatch: {
      type: OPS_ACTION,
      payload: {
        target: "core",
        verb: "feature-archive",
        mode: "archive",
        body: { scope: opts.scope ?? undefined, feature: opts.feature },
      },
    },
  };
}
