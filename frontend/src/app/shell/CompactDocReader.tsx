// The compact sliding document reader (mobile-responsive-layout ADR D5). On
// compact there is no dock workspace; instead a document opens full-screen, one
// at a time, over the Browse pane — the slide-stack push/pop navigation. Selecting
// a result anywhere (Browse list, search) sets the shared `activeDocId`, which
// slides this reader in; the back control pops it (closeDocTab), revealing the
// pane beneath. One document visible at a time; the open-docs stack is the history.
//
// Layer law (dashboard-layer-ownership / view-rewrite-preserves-the-contract): it
// reuses the SAME content wiring the desktop DocPanel uses (`useDockDocPanelView`
// → MarkdownDocView / CodeViewer) and the preserved open/close intents
// (`closeDocTab`); it fetches nothing and reads no raw `tiers`.

import {
  closeDocTab,
  useActiveDocId,
  useDockDocPanelView,
  useOpenDocs,
} from "../../stores/view/tabs";
import type { ViewerSurface } from "../../stores/view/viewStore";
import type { BreadcrumbItem } from "../kit";
import { CodeViewer } from "../viewer/CodeViewer";
import { MarkdownDocView } from "../viewer/MarkdownDocView";
import { MobileTopBar } from "./MobileTopBar";

/** The leaf basename of a `code:<path>` node id, for the reader title. */
function codeTitle(nodeId: string): string {
  const path = nodeId.replace(/^code:/, "");
  return path.split("/").pop() || path || "Code";
}

/** Always-mounted inner pane (so `useDockDocPanelView` runs unconditionally for the
 *  active document). */
function DocReaderPane({
  nodeId,
  surface,
}: {
  nodeId: string;
  surface: ViewerSurface;
}) {
  const view = useDockDocPanelView(nodeId, surface);
  const back = () => closeDocTab(nodeId);

  if (view.state === "code") {
    return (
      <div className="absolute inset-0 z-40 flex flex-col bg-paper animate-slide-in-right">
        <MobileTopBar title={codeTitle(nodeId)} onBack={back} />
        <div className="min-h-0 flex-1 overflow-y-auto" aria-label="code viewer">
          <CodeViewer content={view.content} />
        </div>
      </div>
    );
  }

  const trail: BreadcrumbItem[] = [{ label: "Vault" }, { label: view.header.title }];
  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-paper animate-fade-in">
      <MobileTopBar title={view.header.title} onBack={back} />
      <div className="min-h-0 flex-1 overflow-y-auto" aria-label="document viewer">
        <MarkdownDocView
          nodeId={view.nodeId}
          content={view.content}
          scope={view.scope}
          trail={trail}
        />
      </div>
    </div>
  );
}

/** Renders the active document full-screen, or nothing when no document is open. */
export function CompactDocReader() {
  const activeDocId = useActiveDocId();
  const openDocs = useOpenDocs();
  if (!activeDocId) return null;
  const active = openDocs.find((doc) => doc.nodeId === activeDocId);
  const surface: ViewerSurface = active?.surface ?? "markdown";
  return <DocReaderPane nodeId={activeDocId} surface={surface} />;
}
