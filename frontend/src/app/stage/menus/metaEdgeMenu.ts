// Meta-edge context menu (dashboard-context-menus W04.P11): an aggregated
// feature-to-feature ribbon. The breakdown already unfolds on hover, so the menu
// is modest and honest - copy the breakdown summary (when present) and the id.
// Pure over the descriptor; nothing mutates.

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";

export function metaEdgeMenu(entity: unknown): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "meta-edge") return [];

  return [
    normalizedEntity.summary
      ? copyAction({
          id: "meta-edge:copy-summary",
          label: "Copy summary",
          text: normalizedEntity.summary,
          what: "summary",
        })
      : {
          id: "meta-edge:copy-summary",
          label: "Copy summary",
          section: "copy",
          disabled: true,
          disabledReason: "no summary",
        },
    copyAction({
      id: "meta-edge:copy-id",
      label: "Copy id",
      text: normalizedEntity.id,
      what: "id",
    }),
  ];
}

registerResolver("meta-edge", metaEdgeMenu as ActionResolver);
