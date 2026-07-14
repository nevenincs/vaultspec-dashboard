// Doc-tab context menu (#15): the per-kind resolver for a DOCUMENT TAB header
// (context-menu-actions-are-layered — these are TARGET-RELATIVE verbs whose payload
// depends on WHICH tab was right-clicked, so they live on the per-kind resolver, not
// the standing cmd+K command plane). Keep Open (peg the preview), Reload (refetch the
// body), Close / Close Others / Close All. A pure resolver over the descriptor; the
// provisional/open-count gates are read from the tab store at resolve time (the menu
// opens against a live snapshot), never a fresh-derived selector (stable-selectors).

import { legacyActionPresentation } from "../../../platform/actions/action";
import { Pin, RotateCw, X } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import {
  closeAllDocTabs,
  closeDocTab,
  closeOtherDocTabs,
  promoteDocTab,
  reloadDocTab,
} from "../../../stores/view/tabs";
import { useViewStore } from "../../../stores/view/viewStore";

export function docTabMenu(entity: unknown): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "doc-tab") return [];
  const nodeId = normalizedEntity.nodeId ?? normalizedEntity.id;
  const scope = normalizedEntity.scope;

  const openDocs = useViewStore.getState().openDocs;
  const isProvisional = openDocs.some(
    (doc) => doc.nodeId === nodeId && doc.provisional === true,
  );
  const hasOthers = openDocs.some((doc) => doc.nodeId !== nodeId);

  return [
    {
      id: "doc-tab:keep-open",
      label: legacyActionPresentation("Keep Open"),
      section: "transform",
      icon: Pin,
      disabled: !isProvisional,
      disabledReason: isProvisional
        ? undefined
        : legacyActionPresentation("already a permanent tab"),
      run: () => promoteDocTab(nodeId),
    },
    {
      id: "doc-tab:reload",
      label: legacyActionPresentation("Reload"),
      section: "transform",
      icon: RotateCw,
      run: () => reloadDocTab(nodeId, scope),
    },
    {
      id: "doc-tab:close",
      label: legacyActionPresentation("Close"),
      section: "danger",
      icon: X,
      run: () => closeDocTab(nodeId),
    },
    {
      id: "doc-tab:close-others",
      label: legacyActionPresentation("Close Others"),
      section: "danger",
      disabled: !hasOthers,
      disabledReason: hasOthers
        ? undefined
        : legacyActionPresentation("no other tabs open"),
      run: () => closeOtherDocTabs(nodeId),
    },
    {
      id: "doc-tab:close-all",
      label: legacyActionPresentation("Close All Documents"),
      section: "danger",
      run: () => closeAllDocTabs(),
    },
  ];
}

registerResolver("doc-tab", docTabMenu as ActionResolver);
