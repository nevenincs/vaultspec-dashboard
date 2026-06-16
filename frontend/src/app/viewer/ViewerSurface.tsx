// The viewer surface host (review-rail-viewers ADR P05.S25).
//
// Hosts the markdown reader and the code viewer behind the open-in-viewer
// view-store intent: it reads the `viewerTarget` slice (the node id + surface a
// cross-link opened), drives the SINGLE stores content query keyed on that id +
// the active scope, and routes the resulting content view to the markdown reader
// (a `doc:` target / `markdown` surface) or the code viewer (a `code:` target /
// `code` surface). It is dumb `app/` chrome: it fetches nothing itself (the stores
// query is the sole wire client) and reads no raw `tiers` block — only the
// tiers-derived `ContentView` (dashboard-layer-ownership). Nothing renders when no
// viewer is open.

import type { ReactElement } from "react";
import { X } from "lucide-react";

import { useContentView } from "../../stores/server/queries";
import { useViewStore } from "../../stores/view/viewStore";
import { CodeViewer } from "./CodeViewer";
import { MarkdownReader } from "./MarkdownReader";

/**
 * The viewer surface. Reads the open-in-viewer target from the view store, drives
 * the bounded content query for it, and renders the reader or the viewer by the
 * target's surface. The surface is chosen at the call site by node kind (`doc:` →
 * markdown, `code:` → code) and carried on the intent, so the host routes on it
 * directly. Renders null when no viewer is open.
 */
export function ViewerSurface(): ReactElement | null {
  const target = useViewStore((s) => s.viewerTarget);
  const scope = useViewStore((s) => s.scope);
  const closeViewer = useViewStore((s) => s.closeViewer);
  // The single content query (sole wire client); disabled when no viewer is open.
  const content = useContentView(target?.nodeId ?? null, scope);

  if (!target) return null;

  return (
    <section className="flex h-full flex-col bg-paper" aria-label="document viewer">
      <div className="flex items-center justify-between border-b border-rule px-fg-3 py-fg-1">
        <span className="truncate font-mono text-label text-ink-muted">
          {target.nodeId}
        </span>
        <button
          type="button"
          onClick={closeViewer}
          className="rounded-fg-xs p-fg-0-5 text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          aria-label="close viewer"
        >
          <X size={15} aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {target.surface === "code" ? (
          <CodeViewer content={content} />
        ) : (
          <MarkdownReader content={content} />
        )}
      </div>
    </section>
  );
}
