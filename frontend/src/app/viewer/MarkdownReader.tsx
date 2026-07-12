// The frontmatter-aware, display-only markdown reader (review-rail-viewers ADR;
// re-skinned to the binding Reader board `263:871` / Mode=View in the
// editor-figma-parity campaign).
//
// Renders a `.vault/` document as the binding EDITORIAL reader: a DocHeader block
// (doc-type eyebrow + serif title + italic dek + a date·reading-time·status meta
// line) lifted out of the body, a leading rule, the lead paragraph and GFM body
// (tables, task lists, accent-bulleted lists, blockquotes), fenced code through the
// SHARED Shiki highlighter inside a CodeBlock header bar, and a Tagged/Related
// footer. All chrome reads the `--color-*` / Reader-role tokens (themes-are-oklch /
// design-system-is-centralized) — no new colour. It fetches nothing: dumb `app/`
// chrome over the tiers-derived content view the stores layer supplies
// (dashboard-layer-ownership).

import type { ReactElement, ReactNode } from "react";
import { isValidElement, useMemo, useState } from "react";
import type { Element as HastElement, Root } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import Markdown, { defaultUrlTransform } from "react-markdown";
import { MessageSquare } from "lucide-react";

import { dispatchCopy } from "../../platform/actions/clipboardActions";
import { fireActionDescriptor } from "../../platform/actions/action";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  deriveMarkdownReaderView,
  type ContentView,
  type MarkdownReaderEditorialView,
  type MarkdownReaderView,
} from "../../stores/server/queries";
import { parseDocument } from "../../stores/server/parseDocument";
import { previewDocTab } from "../../stores/view/tabs";
import { useViewportClass } from "../../stores/view/viewportClass";
import {
  Badge,
  IconButton,
  Skeleton,
  SkeletonBar,
  StatusDot,
  StepCheckMark,
  categoryColorVar,
} from "../kit";
import { PlanSummaryCard } from "./PlanSummaryCard";
import { CommentThreadPanel } from "./CommentThreadPanel";
import { languageDisplayName } from "./languages";
import { remarkBlockId } from "./remarkBlockId";
import { remarkWikiLink, wikiLinkNodeId, WIKI_LINK_SCHEME } from "./remarkWikiLink";
import { buildCommentAnchorIndex, type HeadingBlock } from "./sectionAnchor";
import {
  ReaderCommentsContext,
  anchoredCommentsForBlock,
  commentSectionAction,
  orphanedComments,
  useReaderComments,
  type ReaderCommentPlane,
  type ReaderCommentSource,
} from "./readerComments";
import { stopScrollKeyPropagation } from "./scrollRegion";
import { useHighlightedHast } from "./useHighlighter";

/** Preserve the `vaultspec:doc:` wiki-link scheme through react-markdown's URL
 *  sanitizer (which strips unknown schemes by default), while delegating every
 *  OTHER scheme to that same default sanitizer — so a `javascript:`/`data:`/
 *  `vbscript:` URL in a (possibly shared or untrusted) doc body is still stripped
 *  rather than rendered as a live `href`. An identity passthrough preserved the
 *  wiki scheme but disabled sanitization wholesale (a stored-XSS surface). */
function urlTransform(url: string): string {
  return url.startsWith(WIKI_LINK_SCHEME) ? url : defaultUrlTransform(url);
}

/** Render a Shiki HAST tree to React elements through the jsx runtime. */
function hastToReact(hast: Root): ReactElement {
  return toJsxRuntime(hast, { Fragment, jsx, jsxs }) as ReactElement;
}

// --- fenced code (CodeBlock board 256:836) ------------------------------------

/** A fenced code block in the binding CodeBlock chrome: a header bar (language +
 *  a Read-only flag and a Copy affordance) over the shared-highlighter body. */
function CodeFence({
  code,
  lang,
}: {
  code: string;
  lang: string | null;
}): ReactElement {
  const { hast } = useHighlightedHast(code, lang);
  // Mirror the CodeViewer's Copy affordance (a direct clipboard write); the prior
  // bare <span> rendered an actionable-looking "Copy" that did nothing (dead control).
  const onCopy = () => {
    // Route through the copy verb so the execCommand fallback reaches this button
    // too (a bare navigator.clipboard write is a silent no-op on http origins).
    void dispatchCopy({ text: code });
  };
  return (
    <div className="vs-code-fence">
      <div className="vs-code-fence__header">
        <span className="vs-code-fence__lang">{languageDisplayName(lang)}</span>
        <span className="vs-code-fence__actions">
          <span className="vs-code-fence__readonly">Read-only</span>
          <button type="button" className="vs-code-fence__copy" onClick={onCopy}>
            Copy
          </button>
        </span>
      </div>
      <div className="vs-code-fence__body">
        {hast ? (
          hastToReact(hast)
        ) : (
          <pre>
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}

/** The base react-markdown overrides: fenced code → CodeBlock chrome, inline code →
 *  the mono pill. Link routing is scoped per render in `MarkdownBody`. */
const COMPONENTS: Components = {
  code({ className, children }) {
    const text = String(children ?? "");
    const fenceMatch = /language-([\w+-]+)/.exec(className ?? "");
    const isFence = fenceMatch !== null || text.includes("\n");
    if (isFence) {
      return (
        <CodeFence code={text.replace(/\n$/, "")} lang={fenceMatch?.[1] ?? null} />
      );
    }
    return (
      <code className="rounded-fg-xs border border-rule bg-paper-sunken px-fg-0-5 font-mono text-ink">
        {text}
      </code>
    );
  },
  // GFM task-list checkbox → the shared plan-step mark (filled disc + check when
  // done, hollow ring when open), so a plan's steps read identically in the reader
  // body and the right-rail step tree (design-system-is-centralized). The reader is
  // read-only, so the native (disabled) checkbox is replaced outright; the done-row
  // treatment is a CSS rule keyed on this mark's `data-done` (see styles.css).
  input({ type, checked }) {
    if (type === "checkbox") {
      return <StepCheckMark done={checked === true} />;
    }
    return <input type={type} checked={checked} readOnly />;
  },
};

const REMARK_PLUGINS = [remarkGfm, remarkWikiLink, remarkBlockId];

/** Recursively flatten rendered children to their plain text. */
function flattenText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (isValidElement(node)) {
    return flattenText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

/** Read the block-identity data attributes the `remarkBlockId` plugin stamped
 *  (hProperties are copied onto the hast node verbatim; tolerate the camelCased
 *  form defensively). */
function readCommentPath(node: HastElement | undefined): string | null {
  const props = node?.properties as Record<string, unknown> | undefined;
  const raw = props?.["data-comment-path"] ?? props?.dataCommentPath;
  return typeof raw === "string" ? raw : null;
}

function readHeadingId(node: HastElement | undefined): string | undefined {
  const id = (node?.properties as Record<string, unknown> | undefined)?.id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

type HeadingTagName = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

/** A heading carrying its section comment affordance: a right-gutter comment button
 *  (hover-revealed on pointer viewports, always visible on compact) plus a count
 *  chip when the section has comments, and the anchored thread panel when opened.
 *  Absolutely positioned inside a relative wrapper so revealing it never reflows the
 *  prose (no layout thrash on hover). */
function CommentableHeading({
  tag: HeadingTag,
  id,
  text,
  plane,
  block,
  pluginKey,
}: {
  tag: HeadingTagName;
  id: string | undefined;
  text: string;
  plane: ReaderCommentPlane;
  block: HeadingBlock;
  /** The plugin's stamped path key this heading resolved through — the key the
   *  anchor index (and its ambiguity set) is keyed on. */
  pluginKey: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const anchored = anchoredCommentsForBlock(plane.comments, block);
  const count = anchored.length;
  const ambiguous = plane.anchorIndex.ambiguousPaths.has(pluginKey);
  const openThread = () =>
    fireActionDescriptor(
      commentSectionAction({ hasComments: count > 0, onOpen: () => setOpen(true) }),
    );
  return (
    <div className="group relative" data-section-heading>
      {/* Reserve right-gutter space so the always-visible count chip + affordance
          never render over long heading text (no overlap). */}
      <HeadingTag id={id} className="pr-16">
        {text}
      </HeadingTag>
      <span className="absolute right-0 top-0 z-10 flex items-center gap-fg-1">
        {count > 0 && (
          <span data-comment-count>
            <Badge tone="accent">{count}</Badge>
          </span>
        )}
        <span
          data-affordance-visibility={plane.viewport === "compact" ? "always" : "hover"}
          className={
            plane.viewport === "compact"
              ? "opacity-100"
              : "opacity-0 transition-opacity duration-ui-fast group-hover:opacity-100 focus-within:opacity-100"
          }
        >
          <IconButton
            label="Comment on this section"
            data-comment-affordance
            active={open}
            onClick={openThread}
          >
            <MessageSquare size={14} aria-hidden />
          </IconButton>
        </span>
      </span>
      {open && (
        <CommentThreadPanel
          block={block}
          comments={anchored}
          actions={plane}
          anchorIndex={plane.anchorIndex}
          actorReady={plane.actorReady}
          actorBootstrapping={plane.actorBootstrapping}
          ensureActor={plane.ensureActor}
          title={text}
          ambiguous={ambiguous}
          onClose={() => setOpen(false)}
          className="absolute right-0 top-full z-40 mt-fg-1"
        />
      )}
    </div>
  );
}

/** One heading override. A final render-layer guard for the no-noise directive:
 *  every heading renders as PLAIN TEXT (its flattened text content), so even a
 *  heading that bypassed the body sanitizer can never display inline formatting
 *  (the body is heading-sanitized upstream — this is defense-in-depth). When a
 *  comment plane is mounted AND the heading resolves to a live section, it grows the
 *  section comment affordance; otherwise it renders the bare heading. */
function BlockHeading({
  level,
  node,
  children,
}: {
  level: number;
  node?: HastElement;
  children?: ReactNode;
}): ReactElement {
  const plane = useReaderComments();
  const text = flattenText(children);
  const id = readHeadingId(node);
  const HeadingTag = `h${level}` as HeadingTagName;
  const commentPath = plane ? readCommentPath(node) : null;
  const block =
    plane && commentPath !== null
      ? plane.anchorIndex.byPluginPath.get(commentPath)
      : undefined;
  if (!plane || block === undefined) {
    return <HeadingTag id={id}>{text}</HeadingTag>;
  }
  return (
    <CommentableHeading
      tag={HeadingTag}
      id={id}
      text={text}
      plane={plane}
      block={block}
      pluginKey={commentPath!}
    />
  );
}

const HEADING_COMPONENTS: Components = {
  h1: ({ node, children }) => (
    <BlockHeading level={1} node={node} children={children} />
  ),
  h2: ({ node, children }) => (
    <BlockHeading level={2} node={node} children={children} />
  ),
  h3: ({ node, children }) => (
    <BlockHeading level={3} node={node} children={children} />
  ),
  h4: ({ node, children }) => (
    <BlockHeading level={4} node={node} children={children} />
  ),
  h5: ({ node, children }) => (
    <BlockHeading level={5} node={node} children={children} />
  ),
  h6: ({ node, children }) => (
    <BlockHeading level={6} node={node} children={children} />
  ),
};

/** The editorial DocHeader block: doc-type eyebrow, serif title, italic dek, and
 *  the date · reading-time · status meta line (board 259:838). */
function DocHeaderBlock({
  editorial,
}: {
  editorial: MarkdownReaderEditorialView;
}): ReactElement {
  return (
    <header className="flex flex-col gap-[0.6875rem]">
      {editorial.eyebrow && (
        <div className="flex items-center gap-[0.4375rem]">
          <StatusDot category={editorial.eyebrow.category} />
          <span
            className="reader-eyebrow"
            style={{ color: categoryColorVar(editorial.eyebrow.category) }}
          >
            {editorial.eyebrow.label}
          </span>
        </div>
      )}
      {editorial.title && <h1 className="reader-title text-ink">{editorial.title}</h1>}
      {editorial.dek && <p className="reader-dek text-ink-muted">{editorial.dek}</p>}
      {editorial.meta.length > 0 && (
        <p className="reader-meta text-ink-muted">
          {editorial.meta.map((part, idx) => (
            <span key={part}>
              {idx > 0 && <span className="px-[0.625rem] text-ink-faint">·</span>}
              {part}
            </span>
          ))}
        </p>
      )}
    </header>
  );
}

/** The Tagged / Related footer (board 263:886): feature tags as chips and related
 *  stems as in-app wiki-links; the doc-type tag is omitted (it is the eyebrow). */
function ReaderFooter({
  editorial,
  scope,
}: {
  editorial: MarkdownReaderEditorialView;
  scope: string | null;
}): ReactElement | null {
  if (editorial.footerTags.length === 0 && editorial.related.length === 0) {
    return null;
  }
  return (
    <footer className="flex flex-col gap-fg-4 px-fg-4 pb-[1.875rem] pt-[1.375rem] @lg:px-fg-8 @3xl:px-[3rem] @5xl:px-[4.5rem]">
      <div className="h-px w-full bg-rule" />
      {editorial.footerTags.length > 0 && (
        <div className="flex items-center gap-fg-3">
          <span className="reader-meta w-16 shrink-0 text-ink-muted">Tagged</span>
          <div className="flex flex-1 flex-wrap gap-[0.4375rem]">
            {editorial.footerTags.map((tag) => (
              <span
                key={tag.label}
                className="rounded-full bg-paper-sunken px-[0.625rem] py-fg-1 text-[0.6875rem] text-ink-muted"
              >
                {tag.label}
              </span>
            ))}
          </div>
        </div>
      )}
      {editorial.related.length > 0 && (
        <div className="flex items-center gap-fg-3">
          <span className="reader-meta w-16 shrink-0 text-ink-muted">Related</span>
          <div className="flex flex-1 flex-wrap gap-x-fg-4 gap-y-fg-1-5">
            {editorial.related.map((related) => (
              <a
                key={related.nodeId}
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  // Read-mode wiki-link navigation: preview in the single
                  // provisional tab (#15), not an ever-growing pinned tab.
                  void previewDocTab(related.nodeId, "markdown", scope).catch(
                    () => undefined,
                  );
                }}
                className="text-[0.84375rem] font-medium text-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
              >
                {related.stem}
              </a>
            ))}
          </div>
        </div>
      )}
    </footer>
  );
}

/** The rendered reading column: the editorial header, a rule, then the GFM body.
 *  Link routing is scoped per render. */
function MarkdownBody({
  view,
  scope,
  nodeId,
}: {
  view: MarkdownReaderView;
  scope: string | null;
  nodeId: string | null;
}): ReactElement {
  // A plan document carries the "plan" eyebrow category; the summary card mounts
  // for it (self-fetching the engine plan-interior summary) when the host supplied
  // the plan node id.
  const isPlan = view.editorial.eyebrow?.category === "plan";
  const components = useMemo<Components>(
    () => ({
      ...COMPONENTS,
      ...HEADING_COMPONENTS,
      a({ href, children, ...props }) {
        const nodeId = href ? wikiLinkNodeId(href) : null;
        if (nodeId) {
          return (
            <a
              href="#"
              onClick={(event) => {
                event.preventDefault();
                // Read-mode wiki-link navigation: preview in the single
                // provisional tab (#15), not an ever-growing pinned tab.
                void previewDocTab(nodeId, "markdown", scope).catch(() => undefined);
              }}
              className="text-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            >
              {children}
            </a>
          );
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent-text underline-offset-2 hover:underline"
            {...props}
          >
            {children}
          </a>
        );
      },
    }),
    [scope],
  );
  return (
    <div className="px-fg-4 pb-[0.625rem] pt-[1.875rem] @lg:px-fg-8 @3xl:px-[3rem] @5xl:px-[4.5rem]">
      <DocHeaderBlock editorial={view.editorial} />
      {isPlan && nodeId !== null && (
        <div className="mt-fg-3">
          <PlanSummaryCard nodeId={nodeId} scope={scope} />
        </div>
      )}
      <div className="my-fg-4 h-px w-full bg-rule" />
      <article className="vs-markdown">
        <Markdown
          remarkPlugins={REMARK_PLUGINS}
          urlTransform={urlTransform}
          components={components}
        >
          {view.editorial.body}
        </Markdown>
      </article>
    </div>
  );
}

/**
 * The markdown reader surface. Renders the editorial document when content is
 * available, and the designed degraded / empty / error states otherwise — all read
 * from the tiers-derived `ContentView` the stores layer supplies (the reader
 * fetches nothing and reads no raw `tiers` block). A truncated body renders with a
 * quiet honest notice; the full body opens in the file directly.
 */
export function MarkdownReader({
  content,
  scope = null,
  nodeId = null,
  commentSource,
}: {
  content: ContentView;
  scope?: string | null;
  /** The document's graph node id. Supplied for plan documents so the summary
   *  card can fetch the engine plan-interior summary; null for callers that do
   *  not address by node (the card simply does not mount). */
  nodeId?: string | null;
  /** The section-comment plane source, supplied by the smart parent
   *  (`MarkdownDocView`) — the served comments + bound mutations + actor state. When
   *  omitted the reader renders headings plainly (no comment affordances), so a
   *  caller that mounts the reader without comments is unaffected. */
  commentSource?: ReaderCommentSource;
}): ReactElement {
  const markdownView = useMemo(() => deriveMarkdownReaderView(content), [content]);
  const viewport = useViewportClass();
  // The heading anchor index is derived from the RAW served body (frontmatter
  // stripped for clean ancestor paths; the section bytes — and therefore the git
  // blob oids — are identical to the backend's read either way). H1 lift is signaled
  // by an editorial title.
  const anchorIndex = useMemo(
    () =>
      buildCommentAnchorIndex(
        parseDocument(content.text).body,
        markdownView.editorial.title !== null,
      ),
    [content.text, markdownView.editorial.title],
  );
  const commentPlane = useMemo<ReaderCommentPlane | null>(
    () => (commentSource ? { ...commentSource, anchorIndex, viewport } : null),
    [commentSource, anchorIndex, viewport],
  );

  // Loading is UI-ONLY (state-mode-uniformity ADR D2): a shimmer skeleton mimicking
  // the reader's rhythm, never on-screen "Loading…" text — the human label lives
  // only in the kit `Skeleton`'s sr-only. Empty / degraded / error stay plain
  // sentences.
  if (markdownView.state === "loading") {
    return <ReaderSkeleton label={markdownView.stateMessage ?? "Loading document…"} />;
  }
  if (markdownView.state !== "ready") {
    return (
      <ReaderState className={markdownView.stateToneClass}>
        {markdownView.stateMessage}
      </ReaderState>
    );
  }

  // #17 responsive reader padding: the `@container` on the root makes the
  // horizontal body inset query the reader's OWN pane width (not the viewport),
  // so it tightens on a narrow pane (mobile, or a narrow desktop pane with the
  // graph open) and only relaxes to the comfortable editorial inset when wide.
  return (
    <ReaderCommentsContext.Provider value={commentPlane}>
      <div className="@container flex h-full flex-col bg-paper text-ink">
        {markdownView.truncated && (
          <div className="reader-meta border-b border-rule bg-paper-sunken px-fg-4 py-fg-1 text-ink-muted @lg:px-fg-8 @3xl:px-[3rem] @5xl:px-[4.5rem]">
            {markdownView.truncationMessage}
          </div>
        )}
        {commentPlane !== null && <OrphanedNotesBar plane={commentPlane} />}
        {/* Focusable scroll region so the rendered document can be SCROLLED by
            keyboard (arrows / PageUp-Down) even when its prose holds no links to
            tab through (WCAG 2.1.1; keyboard-navigation W03.P06.S19). */}
        <div
          className="min-h-0 flex-1 overflow-auto"
          role="region"
          aria-label="document"
          tabIndex={0}
          // The scroll keys are stopped from the global dispatcher (which would
          // preventDefault them — blocking this scroll — and walk the graph) so the
          // browser scrolls the document natively (review HIGH).
          onKeyDown={stopScrollKeyPropagation}
        >
          <MarkdownBody view={markdownView} scope={scope} nodeId={nodeId} />
          <ReaderFooter editorial={markdownView.editorial} scope={scope} />
        </div>
      </div>
    </ReaderCommentsContext.Provider>
  );
}

/** The document-level orphaned-notes affordance: shown only when a comment's anchor
 *  has drifted off its section (the honest orphan state, never a silent re-anchor).
 *  It opens a panel listing every orphaned note under a clearly-labeled stale state
 *  with the typed reason and an explicit re-anchor. */
function OrphanedNotesBar({
  plane,
}: {
  plane: ReaderCommentPlane;
}): ReactElement | null {
  const [open, setOpen] = useState(false);
  const orphaned = orphanedComments(plane.comments);
  if (orphaned.length === 0) return null;
  return (
    <div className="relative border-b border-rule bg-paper-sunken px-fg-4 py-fg-1 @lg:px-fg-8 @3xl:px-[3rem] @5xl:px-[4.5rem]">
      <button
        type="button"
        data-orphaned-notes
        className="inline-flex items-center gap-fg-1 text-label font-medium text-ink-muted hover:text-ink"
        onClick={() => setOpen((value) => !value)}
      >
        <MessageSquare size={14} aria-hidden />
        {orphaned.length === 1
          ? "1 orphaned note"
          : `${orphaned.length} orphaned notes`}
      </button>
      {open && (
        <CommentThreadPanel
          comments={orphaned}
          actions={plane}
          anchorIndex={plane.anchorIndex}
          actorReady={plane.actorReady}
          actorBootstrapping={plane.actorBootstrapping}
          ensureActor={plane.ensureActor}
          title="Orphaned notes"
          orphanedPanel
          onClose={() => setOpen(false)}
          className="absolute left-fg-4 top-full z-40 mt-fg-1 @lg:left-fg-8"
        />
      )}
    </div>
  );
}

/** Loading is UI-ONLY (state-mode-uniformity ADR D2): a shimmer skeleton standing in
 *  for the reader's title + lead-paragraph rhythm, the human label only in the kit
 *  `Skeleton`'s sr-only. No visible "Loading…" text. */
function ReaderSkeleton({ label }: { label: string }): ReactElement {
  return (
    <Skeleton label={label} className="h-full justify-start gap-fg-3 p-fg-6">
      <SkeletonBar width="w-2/5" height="h-4" />
      <SkeletonBar width="w-full" />
      <SkeletonBar width="w-11/12" />
      <SkeletonBar width="w-5/6" />
      <SkeletonBar width="w-full" />
      <SkeletonBar width="w-3/4" />
    </Skeleton>
  );
}

/** A centred reader placeholder for the loading / empty / degraded / error states
 *  (Reader states board 271:1121). Reads the binding Reader/Meta role; the tone
 *  selects the ink token (faint for empty/loading, muted for degraded, state-broken
 *  for error). */
function ReaderState({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}): ReactElement {
  return (
    <div
      className={`reader-meta flex h-full items-center justify-center p-fg-6 text-center ${className}`}
    >
      <p>{children}</p>
    </div>
  );
}
