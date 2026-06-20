// A document dockview panel (editor-dock-workspace P04). One open document tab:
// it reads the bounded content query for its own node id and renders the
// markdown reader (a `doc:` target) or the read-only code viewer (a `code:`
// target) — the same content wiring the single-doc `ViewerSurface` used, now per
// panel. Dumb `app/` chrome: it fetches nothing itself (the stores content query
// is the sole wire client) and reads no raw `tiers` (dashboard-layer-ownership).
//
// The panel id IS the node id, so dockview geometry and the tab slice reconcile
// by id. Close routes through the tab seam; the dockview tab's own close button
// also removes the panel, which the workspace maps back to `closeDocTab`.

import type { IDockviewPanelProps } from "dockview";

import { closeDocTab, useDockDocPanelView } from "../../stores/view/tabs";
import type { ViewerSurface } from "../../stores/view/viewStore";
import { DocHeader } from "../right/DocHeader";
import { CodeViewer } from "../viewer/CodeViewer";
import { MarkdownDocView } from "../viewer/MarkdownDocView";

export interface DocPanelParams {
  /** The stable node id (`doc:<stem>` / `code:<path>`); also the panel id. */
  nodeId: string;
  /** Which surface to render. Only `markdown` is editable; `code` is read-only. */
  surface: ViewerSurface;
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
      <DocHeader {...view.header} onClose={() => closeDocTab(view.nodeId)} />
      <div className="min-h-0 flex-1">
        <MarkdownDocView
          nodeId={view.nodeId}
          content={view.content}
          scope={view.scope}
        />
      </div>
    </section>
  );
}
