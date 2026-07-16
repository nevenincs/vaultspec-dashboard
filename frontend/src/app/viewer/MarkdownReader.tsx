import type { ReactElement, ReactNode } from "react";
import { isValidElement, useEffect, useMemo, useRef, useState } from "react";
import type { Element as HastElement, Root } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import Markdown, { defaultUrlTransform } from "react-markdown";
import { MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

import { dispatchCopy } from "../../platform/actions/clipboardActions";
import { fireActionDescriptor } from "../../platform/actions/action";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { formatDate } from "../../platform/localization/formatters";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  deriveMarkdownReaderView,
  type ContentView,
  type MarkdownReaderEditorialView,
  type MarkdownReaderView,
} from "../../stores/server/queries";
import { parseDocument } from "../../stores/server/parseDocument";
import {
  COMMENT_ACTIONS,
  commentsToReviewCountDescriptor,
} from "../../stores/server/authoring/commentVocabulary";
import {
  DOCUMENT_VIEWER_MESSAGES,
  documentViewerDocumentTypeDescriptor,
  documentViewerMetadataDescriptor,
  documentViewerStateDescriptor,
  documentViewerStatusDescriptor,
  documentViewerTruncationDescriptor,
} from "../../stores/server/documentViewerVocabulary";
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
import { copyLinkAction } from "../../stores/view/documentLinkActions";
import { PlanSummaryCard } from "./PlanSummaryCard";
import { CommentThreadPanel } from "./CommentThreadPanel";
import { languageDisplayDescriptor } from "./languages";
import { remarkBlockId } from "./remarkBlockId";
import {
  remarkWikiLink,
  wikiLinkFragment,
  wikiLinkNodeId,
  WIKI_LINK_SCHEME,
} from "./remarkWikiLink";
import {
  clearSectionScroll,
  requestSectionScroll,
  useReaderSectionScroll,
} from "./readerSectionScroll";
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
import { stageAgentComment } from "../../stores/view/agentComposer";
import { openAgentPanel } from "../../stores/view/agentPanel";
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
  const resolveMessage = useLocalizedMessageResolver();
  const { hast } = useHighlightedHast(code, lang);
  const readOnly = resolveMessage(DOCUMENT_VIEWER_MESSAGES.labels.readOnly);
  const copy = resolveMessage(DOCUMENT_VIEWER_MESSAGES.actions.copy);
  const language = resolveMessage(languageDisplayDescriptor(lang, "text"));
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
        <span className="vs-code-fence__lang">{language.message}</span>
        {!readOnly.usedFallback && !copy.usedFallback && (
          <span className="vs-code-fence__actions">
            <span className="vs-code-fence__readonly">{readOnly.message}</span>
            <button type="button" className="vs-code-fence__copy" onClick={onCopy}>
              {copy.message}
            </button>
          </span>
        )}
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
  const resolveMessage = useLocalizedMessageResolver();
  const [open, setOpen] = useState(false);
  const anchored = anchoredCommentsForBlock(plane.comments, block);
  const count = anchored.length;
  const ambiguous = plane.anchorIndex.ambiguousPaths.has(pluginKey);
  const openComments = resolveMessage(COMMENT_ACTIONS.open);
  const openThread = () =>
    fireActionDescriptor(
      commentSectionAction({ hasComments: count > 0, onOpen: () => setOpen(true) }),
    );
  // Copy a section link (`[[stem#slug]]`) through the shared copy-link descriptor
  // family (S32) — the slug is this heading's stamped block-identity id, so the
  // emitted link round-trips back to this section on follow. Available only when the
  // source is a document and the heading carries a slug.
  const copySectionLink =
    plane.docStem !== null && id !== undefined
      ? () => fireActionDescriptor(copyLinkAction({ stem: plane.docStem, heading: id }))
      : undefined;
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
        {!openComments.usedFallback && (
          <span
            data-affordance-visibility={
              plane.viewport === "compact" ? "always" : "hover"
            }
            className={
              plane.viewport === "compact"
                ? "opacity-100"
                : "opacity-0 transition-opacity duration-ui-fast group-hover:opacity-100 focus-within:opacity-100"
            }
          >
            <IconButton
              label={openComments.message}
              data-comment-affordance
              active={open}
              onClick={openThread}
            >
              <MessageSquare size={14} aria-hidden />
            </IconButton>
          </span>
        )}
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
          onCopyLink={copySectionLink}
          onSendToAgent={(served) => {
            // Stage the anchored comment (body + section anchor + doc provenance)
            // into the composer's pending batch and open the panel (feedback-loop
            // ADR D6). The interim serialization rides the prompt text; the
            // structured feedback_batch_id continuation is upstream-gated.
            stageAgentComment({
              commentId: served.comment.comment_id,
              docStem: plane.docStem,
              headingPath: served.comment.selector.heading_path,
              body: served.comment.body,
            });
            openAgentPanel();
          }}
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

const READER_DATE_OPTIONS = Object.freeze({
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  year: "numeric",
} as const satisfies Intl.DateTimeFormatOptions);
const TAG_PREFIX = String.fromCodePoint(35);

function localizedReaderDate(locale: string, iso: string | null): string | null {
  if (iso === null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(iso);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return formatDate(locale, timestamp, READER_DATE_OPTIONS);
}

function DocHeaderBlock({
  editorial,
}: {
  editorial: MarkdownReaderEditorialView;
}): ReactElement {
  const resolveMessage = useLocalizedMessageResolver();
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const type = resolveMessage(
    documentViewerDocumentTypeDescriptor(editorial.documentType),
  );
  const created = localizedReaderDate(locale, editorial.createdAt);
  const updated = localizedReaderDate(locale, editorial.updatedAt);
  const status =
    editorial.status === null
      ? null
      : resolveMessage(documentViewerStatusDescriptor(editorial.status));
  const metadataDescriptor = documentViewerMetadataDescriptor({
    created,
    updated,
    minutes: editorial.readMinutes,
    status: status?.message ?? null,
  });
  const metadata =
    metadataDescriptor === null ? null : resolveMessage(metadataDescriptor);
  return (
    <header className="flex flex-col gap-[0.6875rem]">
      {!type.usedFallback && (
        <div className="flex items-center gap-[0.4375rem]">
          {editorial.documentType !== null && (
            <StatusDot category={editorial.documentType} />
          )}
          <span
            className="reader-eyebrow"
            style={
              editorial.documentType === null
                ? undefined
                : { color: categoryColorVar(editorial.documentType) }
            }
          >
            {type.message}
          </span>
        </div>
      )}
      {editorial.title && <h1 className="reader-title text-ink">{editorial.title}</h1>}
      {editorial.dek && <p className="reader-dek text-ink-muted">{editorial.dek}</p>}
      {metadata !== null && !metadata.usedFallback && (
        <p className="reader-meta text-ink-muted">{metadata.message}</p>
      )}
    </header>
  );
}

function ReaderFooter({
  editorial,
  scope,
}: {
  editorial: MarkdownReaderEditorialView;
  scope: string | null;
}): ReactElement | null {
  const resolveMessage = useLocalizedMessageResolver();
  const tags = resolveMessage(DOCUMENT_VIEWER_MESSAGES.labels.tags);
  const relatedDocuments = resolveMessage(
    DOCUMENT_VIEWER_MESSAGES.labels.relatedDocuments,
  );
  if (editorial.footerTags.length === 0 && editorial.related.length === 0) {
    return null;
  }
  return (
    <footer className="flex flex-col gap-fg-4 px-fg-4 pb-[1.875rem] pt-[1.375rem] @lg:px-fg-8 @3xl:px-[3rem] @5xl:px-[4.5rem]">
      <div className="h-px w-full bg-rule" />
      {editorial.footerTags.length > 0 && !tags.usedFallback && (
        <div className="flex items-center gap-fg-3">
          <span className="reader-meta w-16 shrink-0 text-ink-muted">
            {tags.message}
          </span>
          <div className="flex flex-1 flex-wrap gap-[0.4375rem]">
            {editorial.footerTags.map((tag) => (
              <span
                key={tag.value}
                className="rounded-full bg-paper-sunken px-[0.625rem] py-fg-1 text-[0.6875rem] text-ink-muted"
              >
                {TAG_PREFIX}
                {tag.value}
              </span>
            ))}
          </div>
        </div>
      )}
      {editorial.related.length > 0 && !relatedDocuments.usedFallback && (
        <div className="flex items-center gap-fg-3">
          <span className="reader-meta w-16 shrink-0 text-ink-muted">
            {relatedDocuments.message}
          </span>
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
  const isPlan = view.editorial.documentType === "plan";
  const components = useMemo<Components>(
    () => ({
      ...COMPONENTS,
      ...HEADING_COMPONENTS,
      a({ href, children, ...props }) {
        const nodeId = href ? wikiLinkNodeId(href) : null;
        if (nodeId) {
          const fragment = href ? wikiLinkFragment(href) : null;
          return (
            <a
              href="#"
              onClick={(event) => {
                event.preventDefault();
                // Read-mode wiki-link navigation: preview in the single
                // provisional tab (#15), not an ever-growing pinned tab. A section
                // link (`[[stem#slug]]`) records the scroll intent so the target
                // reader scrolls to the heading once its content renders (S31).
                void previewDocTab(nodeId, "markdown", scope)
                  .then(() => {
                    if (fragment) requestSectionScroll(nodeId, fragment);
                  })
                  .catch(() => undefined);
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
  const resolveMessage = useLocalizedMessageResolver();
  const markdownView = useMemo(() => deriveMarkdownReaderView(content), [content]);
  const viewport = useViewportClass();
  const stateDescriptor = documentViewerStateDescriptor(markdownView.state);
  const stateMessage =
    stateDescriptor === null ? null : resolveMessage(stateDescriptor);
  const documentLabel = resolveMessage(DOCUMENT_VIEWER_MESSAGES.accessibility.document);
  const truncationDescriptor =
    markdownView.truncated === null
      ? null
      : documentViewerTruncationDescriptor(
          markdownView.truncated.returned_bytes,
          markdownView.truncated.total_bytes,
        );
  const truncation =
    truncationDescriptor === null ? null : resolveMessage(truncationDescriptor);
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

  // Scroll-to-section (S31): when a followed section wiki-link recorded a scroll
  // intent for this document, scroll to the heading carrying that slug id once the
  // content is rendered (the doc may load async — the effect re-runs when the state
  // flips to ready). The slug is the block-identity id the `remarkBlockId` plugin
  // stamped, so resolution is by that SAME identity, never a second slugger.
  const scrollRegionRef = useRef<HTMLDivElement>(null);
  const scrollSlug = useReaderSectionScroll(nodeId);
  useEffect(() => {
    if (scrollSlug === null || nodeId === null) return;
    if (markdownView.state !== "ready") return;
    const region = scrollRegionRef.current;
    if (region !== null) {
      const heading = Array.from(
        region.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"),
      ).find((el) => el.id === scrollSlug);
      if (heading !== undefined) {
        heading.scrollIntoView({ block: "start" });
        // a11y: move focus to the section so keyboard/AT users land there too. The
        // heading is not natively focusable; make it programmatically focusable and
        // focus without a second scroll.
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      }
    }
    // Consume the intent whether or not the heading was found — a missing anchor is
    // a plain open, never a lingering stale target.
    clearSectionScroll(nodeId);
  }, [scrollSlug, nodeId, markdownView.state]);

  // Clear a still-pending intent if this reader unmounts (or its document changes)
  // before consuming it — a failed or aborted load must never leave a dormant intent
  // that would scroll-jump a later, unrelated reopen of the same document.
  useEffect(() => {
    return () => {
      if (nodeId !== null) clearSectionScroll(nodeId);
    };
  }, [nodeId]);

  // Loading is UI-ONLY (state-mode-uniformity ADR D2): a shimmer skeleton mimicking
  // the reader's rhythm, never on-screen "Loading…" text — the human label lives
  // only in the kit `Skeleton`'s sr-only. Empty / degraded / error stay plain
  // sentences.
  if (markdownView.state === "loading") {
    return <ReaderSkeleton label={stateMessage!.message} />;
  }
  if (markdownView.state !== "ready") {
    return (
      <ReaderState className={readerStateToneClass(markdownView.stateTone)}>
        {stateMessage!.message}
      </ReaderState>
    );
  }
  if (documentLabel.usedFallback) {
    return (
      <ReaderState className="text-state-broken">{documentLabel.message}</ReaderState>
    );
  }

  // #17 responsive reader padding: the `@container` on the root makes the
  // horizontal body inset query the reader's OWN pane width (not the viewport),
  // so it tightens on a narrow pane (mobile, or a narrow desktop pane with the
  // graph open) and only relaxes to the comfortable editorial inset when wide.
  return (
    <ReaderCommentsContext.Provider value={commentPlane}>
      <div className="@container flex h-full flex-col bg-paper text-ink">
        {truncation !== null && !truncation.usedFallback && (
          <div className="reader-meta border-b border-rule bg-paper-sunken px-fg-4 py-fg-1 text-ink-muted @lg:px-fg-8 @3xl:px-[3rem] @5xl:px-[4.5rem]">
            {truncation.message}
          </div>
        )}
        {commentPlane !== null && <OrphanedNotesBar plane={commentPlane} />}
        {/* Focusable scroll region so the rendered document can be SCROLLED by
            keyboard (arrows / PageUp-Down) even when its prose holds no links to
            tab through (WCAG 2.1.1; keyboard-navigation W03.P06.S19). */}
        <div
          ref={scrollRegionRef}
          className="min-h-0 flex-1 overflow-auto"
          role="region"
          aria-label={documentLabel.message}
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

function OrphanedNotesBar({
  plane,
}: {
  plane: ReaderCommentPlane;
}): ReactElement | null {
  const resolveMessage = useLocalizedMessageResolver();
  const [open, setOpen] = useState(false);
  const orphaned = orphanedComments(plane.comments);
  if (orphaned.length === 0) return null;
  const commentsToReview = resolveMessage(
    commentsToReviewCountDescriptor(orphaned.length),
  );
  if (commentsToReview.usedFallback) return null;
  return (
    <div className="relative border-b border-rule bg-paper-sunken px-fg-4 py-fg-1 @lg:px-fg-8 @3xl:px-[3rem] @5xl:px-[4.5rem]">
      <button
        type="button"
        data-orphaned-notes
        className="inline-flex items-center gap-fg-1 text-label font-medium text-ink-muted hover:text-ink"
        onClick={() => setOpen((value) => !value)}
      >
        <MessageSquare size={14} aria-hidden />
        {commentsToReview.message}
      </button>
      {open && (
        <CommentThreadPanel
          comments={orphaned}
          actions={plane}
          anchorIndex={plane.anchorIndex}
          actorReady={plane.actorReady}
          actorBootstrapping={plane.actorBootstrapping}
          ensureActor={plane.ensureActor}
          title={commentsToReview.message}
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

function readerStateToneClass(tone: MarkdownReaderView["stateTone"]): string {
  if (tone === "broken") return "text-state-broken";
  if (tone === "muted") return "text-ink-muted";
  return "text-ink-faint";
}
