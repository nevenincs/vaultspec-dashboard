// A document dockview panel (editor-dock-workspace P04). One open document tab:
// it reads the bounded content query for its own node id and renders the
// markdown reader (a `doc:` target) or the read-only code viewer (a `code:`
// target) — the same content wiring the single-doc `ViewerSurface` used, now per
// panel. Dumb `app/` chrome: it fetches nothing itself (the stores content query
// is the sole wire client) and reads no raw `tiers` (dashboard-layer-ownership).
//
// The panel id IS the node id, so dockview geometry and the tab slice reconcile
// by id. Close routes through the dockview tab's own close button (mapped back to
// `closeDocTab`); the binding reader chrome (breadcrumb + View/Edit toggle) lives
// inside `MarkdownDocView` (editor-figma-parity), so the panel adds no second
// header bar.

import type { IDockviewPanelProps } from "dockview";

import { useDockDocPanelView } from "../../stores/view/tabs";
import type { MarkdownHeaderView } from "../../stores/server/queries";
import type { ViewerSurface } from "../../stores/view/viewStore";
import type { BreadcrumbItem } from "../kit";
import { CodeViewer } from "../viewer/CodeViewer";
import { MarkdownDocView } from "../viewer/MarkdownDocView";

export interface DocPanelParams {
  /** The stable node id (`doc:<stem>` / `code:<path>`); also the panel id. */
  nodeId: string;
  /** Which surface to render. Only `markdown` is editable; `code` is read-only. */
  surface: ViewerSurface;
}

/** Plain-language display labels for the breadcrumb's doc-type segment, matching
 *  the binding reader chrome (e.g. an ADR reads "Decisions", not "adr"). */
const DOC_TYPE_CRUMB: Record<string, string> = {
  adr: "Decisions",
  research: "Research",
  plan: "Plans",
  exec: "Execution",
  audit: "Audits",
  reference: "Reference",
  index: "Index",
};

/** Build the chrome breadcrumb trail (Vault / <doc-type> / <title>) from the
 *  preserved stores header model — the binding reader path (455:1117). */
function docTrail(header: MarkdownHeaderView): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [{ label: "Vault" }];
  const type = header.categoryLabel;
  if (type) {
    items.push({
      label: DOC_TYPE_CRUMB[type] ?? type.charAt(0).toUpperCase() + type.slice(1),
    });
  }
  items.push({ label: header.title });
  return items;
}

export function DocPanel(props: IDockviewPanelProps<DocPanelParams>) {
  const { nodeId, surface } = props.params;
  const view = useDockDocPanelView(nodeId, surface);

  if (view.state === "code") {
    return (
      <section className="flex h-full flex-col bg-paper" aria-label="code viewer">
        <div className="min-h-0 flex-1">
          <CodeViewer content={view.content} />
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full flex-col bg-paper" aria-label="document viewer">
      <div className="min-h-0 flex-1">
        <MarkdownDocView
          nodeId={view.nodeId}
          content={view.content}
          scope={view.scope}
          trail={docTrail(view.header)}
        />
      </div>
    </section>
  );
}
