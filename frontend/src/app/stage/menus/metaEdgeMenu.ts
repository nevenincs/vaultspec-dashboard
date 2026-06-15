// Meta-edge context menu (dashboard-context-menus W04.P11): an aggregated
// feature-to-feature ribbon. The breakdown already unfolds on hover, so the menu
// is modest and honest - copy the breakdown summary (when present) and the id.
// Pure over the descriptor; nothing mutates.

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import type { MetaEdgeEntity } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";

export function metaEdgeMenu(entity: MetaEdgeEntity): ActionDescriptor[] {
  return [
    entity.summary
      ? copyAction({
          id: "meta-edge:copy-summary",
          label: "Copy summary",
          text: entity.summary,
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
      text: entity.id,
      what: "id",
    }),
  ];
}

registerResolver("meta-edge", metaEdgeMenu as ActionResolver<MetaEdgeEntity>);
