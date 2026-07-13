// The compact sliding document reader (mobile-responsive-layout ADR D5; enriched by
// mobile-enrichment ADR D3/D4). On compact there is no dock workspace; instead a
// document opens full-screen, one at a time, over the Browse pane — the slide-stack
// push/pop navigation. Selecting a result anywhere (Browse list, search) sets the
// shared `activeDocId`, which slides this reader in; the back control pops it,
// revealing the pane beneath. One document visible at a time; the open-docs stack is
// the history.
//
// Enrichment:
//   D3 — the reader now shows the SHARED canonical trail (Vault / <doc-type> /
//        <title>) via `buildDocTrail`, the same helper the desktop DocPanel uses —
//        retiring the bare 2-item breadcrumb.
//   D4 — a leading-edge swipe-back gesture (Class-B widget-intrinsic, kept inside
//        this component) fires the SAME guarded close as the tap-back control, so an
//        unsaved editor draft is never silently discarded by either path.
//
// Layer law (dashboard-layer-ownership / view-rewrite-preserves-the-contract): it
// reuses the SAME content wiring the desktop DocPanel uses (`useDockDocPanelView`
// → MarkdownDocView / CodeViewer) and the preserved open/close intents
// (`closeDocTab`, guarded by `guardUnsavedDiscardForDoc`); it fetches nothing and
// reads no raw `tiers`.

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useRef,
  useState,
} from "react";

import {
  closeDocTab,
  useActiveDocId,
  useDockDocPanelView,
  useOpenDocs,
} from "../../stores/view/tabs";
import { guardUnsavedDiscardForDoc } from "../../stores/view/unsavedEditGuard";
import type { ViewerSurface } from "../../stores/view/viewStore";
import { CodeViewer } from "../viewer/CodeViewer";
import { buildDocTrail } from "../viewer/docTrail";
import { MarkdownDocView } from "../viewer/MarkdownDocView";
import { MobileTopBar } from "./MobileTopBar";

/** The leaf basename of a `code:<path>` node id, for the reader title. */
function codeTitle(nodeId: string): string {
  const path = nodeId.replace(/^code:/, "");
  return path.split("/").pop() || path || "Code";
}

// --- edge-swipe-back gesture (mobile-enrichment ADR D4) --------------------------
// A drag that STARTS within the leading-edge band and travels horizontally past the
// commit threshold fires the guarded back; a drag with vertical intent yields to the
// reader's own scroll (never hijacks it). Widget-intrinsic — it lives here, not in
// the global keymap/dispatch (actions-keymap-palette Class-A/B split). Touch/pen
// only; a mouse keeps the tap-back control. Real-device scroll-intent + iOS
// system-back interplay is a live-verify item (ADR D4 consequences).
const EDGE_START_PX = 24;
const COMMIT_FRACTION = 0.28;
const VERTICAL_YIELD_PX = 12;

/** True while the reader document holds a live, non-collapsed text selection.
 *  The gesture yields to it (touch-selectability ADR D3): prose selection owns
 *  the surface, and a long-press selection that begins after pointer-down
 *  disarms an already-armed swipe. */
function hasLiveSelection(): boolean {
  const selection = typeof document === "undefined" ? null : document.getSelection();
  return selection !== null && !selection.isCollapsed && selection.rangeCount > 0;
}

function useEdgeSwipeBack(onBack: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [dragX, setDragX] = useState(0);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse") return;
    if (hasLiveSelection()) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left <= EDGE_START_PX) {
      start.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s) return;
    if (hasLiveSelection()) {
      start.current = null;
      setDragX(0);
      return;
    }
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > VERTICAL_YIELD_PX) {
      start.current = null;
      setDragX(0);
      return;
    }
    setDragX(Math.max(0, dx));
  }, []);

  const onPointerEnd = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const committed =
        start.current !== null &&
        dragX > e.currentTarget.getBoundingClientRect().width * COMMIT_FRACTION;
      start.current = null;
      setDragX(0);
      if (committed) onBack();
    },
    [dragX, onBack],
  );

  return {
    dragX,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
    },
  };
}

/** Always-mounted inner pane (so `useDockDocPanelView` runs unconditionally for the
 *  active document). */
function DocReaderPane({
  nodeId,
  surface,
  scope,
}: {
  nodeId: string;
  surface: ViewerSurface;
  scope: string | null;
}) {
  const view = useDockDocPanelView(nodeId, surface, scope);
  // Both the tap-back control and the edge-swipe route the SAME doc-scoped guard, so
  // a dirty draft for THIS document arms the discard confirm before the reader pops
  // (mobile-enrichment ADR D4).
  const back = useCallback(
    () => guardUnsavedDiscardForDoc(nodeId, () => closeDocTab(nodeId)),
    [nodeId],
  );
  const swipe = useEdgeSwipeBack(back);
  // `pan-y` lets the browser own vertical scroll while the gesture claims horizontal
  // travel, so the edge-swipe never fights the reader's own scrolling.
  const swipeStyle: CSSProperties = {
    touchAction: "pan-y",
    ...(swipe.dragX ? { transform: `translateX(${swipe.dragX}px)` } : {}),
  };

  if (view.state === "code") {
    return (
      <div
        className="absolute inset-0 z-40 flex flex-col bg-paper animate-slide-in-right"
        style={swipeStyle}
        {...swipe.handlers}
      >
        <MobileTopBar title={codeTitle(nodeId)} onBack={back} />
        <div className="min-h-0 flex-1 overflow-y-auto" aria-label="code viewer">
          <CodeViewer content={view.content} />
        </div>
      </div>
    );
  }

  // Drop the "Vault" root on compact so the doc-type / title pair reads without
  // ellipsizing every crumb in the narrow reader chrome (ADR D6).
  const trail = buildDocTrail(view.header, { includeRoot: false });
  return (
    <div
      className="absolute inset-0 z-40 flex flex-col bg-paper animate-fade-in"
      style={swipeStyle}
      {...swipe.handlers}
    >
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
  return (
    <DocReaderPane
      nodeId={activeDocId}
      surface={surface}
      scope={active?.scope ?? null}
    />
  );
}
