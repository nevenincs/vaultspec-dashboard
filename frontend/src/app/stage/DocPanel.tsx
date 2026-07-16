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
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";

import { useDockDocPanelView } from "../../stores/view/tabs";
import type { ViewerSurface } from "../../stores/view/viewStore";
import { CodeViewer } from "../viewer/CodeViewer";
import { buildDocTrail } from "../viewer/docTrail";
import { MarkdownDocView } from "../viewer/MarkdownDocView";

export interface DocPanelParams {
  /** The stable node id (`doc:<stem>` / `code:<path>`); also the panel id. */
  nodeId: string;
  /** Which surface to render. Only `markdown` is editable; `code` is read-only. */
  surface: ViewerSurface;
  /** The scope the tab was opened in (per-tab-scope-binding); null falls back to the
   *  active scope. Threaded so the panel reads its content/mutations against the tab's
   *  own workspace, not the shared session's active scope. */
  scope: string | null;
}

export function DocPanel(props: IDockviewPanelProps<DocPanelParams>) {
  const resolveMessage = useLocalizedMessageResolver();
  const { nodeId, surface, scope } = props.params;
  const view = useDockDocPanelView(nodeId, surface, scope);

  if (view.state === "code") {
    return (
      <section
        className="flex h-full flex-col bg-paper"
        aria-label={
          resolveMessage({ key: "documents:workspace.accessibility.codeViewer" })
            .message
        }
      >
        <div className="min-h-0 flex-1">
          <CodeViewer content={view.content} />
        </div>
      </section>
    );
  }

  return (
    <section
      className="flex h-full flex-col bg-paper"
      aria-label={
        resolveMessage({ key: "documents:workspace.accessibility.documentViewer" })
          .message
      }
    >
      <div className="min-h-0 flex-1">
        <MarkdownDocView
          nodeId={view.nodeId}
          content={view.content}
          scope={view.scope}
          trail={buildDocTrail(view.header, {
            rootLabel: resolveMessage({ key: "documents:labels.vault" }).message,
          })}
        />
      </div>
    </section>
  );
}
