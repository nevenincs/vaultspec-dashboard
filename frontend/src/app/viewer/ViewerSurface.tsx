// The viewer surface host (review-rail-viewers ADR P05.S25; DocHeader crown
// figma-frontend-rewrite W02.P06.S09).
//
// Hosts the markdown reader and the code viewer behind the open-in-viewer
// view-store intent: it reads the `viewerTarget` slice (the node id + surface a
// cross-link opened), drives the SINGLE stores content query keyed on that id +
// the active scope, and routes the resulting content view to the markdown reader
// (a `doc:` target / `markdown` surface) or the code viewer (a `code:` target /
// `code` surface). The markdown surface is crowned by the binding DocHeader
// (board 283:1170), whose props are derived purely from the parsed document and
// the served path. It is dumb `app/` chrome: it fetches nothing itself (the
// stores query is the sole wire client) and reads no raw `tiers` block — only the
// tiers-derived `ContentView` (dashboard-layer-ownership). Nothing renders when no
// viewer is open.

import type { ReactElement } from "react";
import { useEffect, useMemo } from "react";
import { X } from "lucide-react";

import { parseDocument } from "../../stores/server/parseDocument";
import { useContentView, type ContentView } from "../../stores/server/queries";
import { useViewStore } from "../../stores/view/viewStore";
import { docTypeCategory } from "../left/vaultRowPresentation";
import { IconButton } from "../kit";
import type { BreadcrumbItem } from "../kit";
import { CodeViewer } from "./CodeViewer";
import { DocHeader, type DocHeaderMeta, type DocHeaderProps } from "../right/DocHeader";
import { MarkdownReader } from "./MarkdownReader";

/** The doc-type segment of a `.vault/<type>/...` path, or null for a non-vault
 *  (code) path. Falls back to the stem's trailing `-<type>` suffix when the path
 *  is absent but the stem carries the canonical type marker. */
function docTypeFor(path: string | undefined, stem: string): string | null {
  if (path) {
    const m = /(?:^|\/)\.vault\/([^/]+)\//.exec(path);
    if (m) return m[1];
  }
  const suffix = /-(research|adr|plan|exec|audit|reference|index)$/.exec(stem);
  return suffix ? suffix[1] : null;
}

/** A readable title from the document stem: strip the leading ISO date and turn
 *  the kebab identity into spaced words. The vault H1 carries markdown syntax
 *  (backticks, bold) that would render literally in the serif title role, so the
 *  derived stem title is both cleaner and robust. */
function titleFromStem(stem: string): string {
  return stem.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/-/g, " ") || stem;
}

/** Derive the binding DocHeader props for an open markdown document from its node
 *  id and the served content view (path + parsed frontmatter). Pure — no fetch. */
function markdownHeaderProps(
  nodeId: string,
  content: ContentView,
  onClose: () => void,
): DocHeaderProps {
  const stem = nodeId.replace(/^doc:/, "");
  const docType = docTypeFor(content.path, stem);
  const category = docType ? (docTypeCategory(docType) ?? undefined) : undefined;
  const { frontmatter } = parseDocument(content.text);

  // Breadcrumb trail from the served path's directory segments (not navigable
  // folder targets, so no onSelect — they orient, the close affordance returns).
  const trail: BreadcrumbItem[] | undefined = content.path
    ? content.path
        .split("/")
        .slice(0, -1)
        .filter(Boolean)
        .map((label) => ({ label }))
    : undefined;

  const meta: DocHeaderMeta[] = [];
  if (frontmatter?.date) meta.push({ label: "created", value: frontmatter.date });
  if (frontmatter?.modified)
    meta.push({ label: "modified", value: frontmatter.modified });

  return {
    title: titleFromStem(stem),
    trail,
    category,
    categoryLabel: docType ?? undefined,
    meta: meta.length > 0 ? meta : undefined,
    onClose,
  };
}

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

  // Escape closes the reader (standard overlay dismissal), restoring the graph
  // beneath it. Only bound while a viewer is open.
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeViewer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, closeViewer]);

  const headerProps = useMemo(
    () =>
      target && target.surface !== "code"
        ? markdownHeaderProps(target.nodeId, content, closeViewer)
        : null,
    [target, content, closeViewer],
  );

  if (!target) return null;

  if (target.surface === "code") {
    return (
      <section className="flex h-full flex-col bg-paper" aria-label="code viewer">
        <div className="flex items-center justify-between border-b border-rule px-fg-3 py-fg-1">
          <span className="truncate font-mono text-label text-ink-muted">
            {target.nodeId}
          </span>
          <IconButton label="close viewer" onClick={closeViewer}>
            <X size={15} aria-hidden />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1">
          <CodeViewer content={content} />
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full flex-col bg-paper" aria-label="document viewer">
      {headerProps && <DocHeader {...headerProps} />}
      <div className="min-h-0 flex-1">
        <MarkdownReader content={content} />
      </div>
    </section>
  );
}
