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
import { isValidElement, useMemo } from "react";
import type { Root } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import Markdown, { defaultUrlTransform } from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  deriveMarkdownReaderView,
  type ContentView,
  type MarkdownReaderEditorialView,
  type MarkdownReaderView,
} from "../../stores/server/queries";
import { openDocTab } from "../../stores/view/tabs";
import { StatusDot, categoryColorVar } from "../kit";
import { remarkWikiLink, wikiLinkNodeId, WIKI_LINK_SCHEME } from "./remarkWikiLink";
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

const LANG_LABEL: Record<string, string> = {
  typescript: "TypeScript",
  ts: "TypeScript",
  tsx: "TSX",
  javascript: "JavaScript",
  js: "JavaScript",
  jsx: "JSX",
  rust: "Rust",
  python: "Python",
  py: "Python",
  bash: "Bash",
  sh: "Shell",
  shell: "Shell",
  json: "JSON",
  toml: "TOML",
  yaml: "YAML",
  yml: "YAML",
  css: "CSS",
  html: "HTML",
  markdown: "Markdown",
  md: "Markdown",
};

function langLabel(lang: string | null): string {
  if (!lang) return "Text";
  return LANG_LABEL[lang] ?? lang;
}

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
  return (
    <div className="vs-code-fence">
      <div className="vs-code-fence__header">
        <span className="vs-code-fence__lang">{langLabel(lang)}</span>
        <span className="vs-code-fence__actions">
          <span className="vs-code-fence__readonly">Read-only</span>
          <span className="vs-code-fence__copy">Copy</span>
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
};

const REMARK_PLUGINS = [remarkGfm, remarkWikiLink];

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

/** Heading overrides — a final render-layer guard for the no-noise directive:
 *  every heading renders as PLAIN TEXT (its flattened text content), so even a
 *  heading that bypassed the body sanitizer can never display inline formatting.
 *  The body is heading-sanitized upstream (sanitizeReaderBody); this is
 *  defense-in-depth. */
const HEADING_COMPONENTS: Components = {
  h1: ({ children }) => <h1>{flattenText(children)}</h1>,
  h2: ({ children }) => <h2>{flattenText(children)}</h2>,
  h3: ({ children }) => <h3>{flattenText(children)}</h3>,
  h4: ({ children }) => <h4>{flattenText(children)}</h4>,
  h5: ({ children }) => <h5>{flattenText(children)}</h5>,
  h6: ({ children }) => <h6>{flattenText(children)}</h6>,
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
    <footer className="flex flex-col gap-fg-4 px-[4.5rem] pb-[1.875rem] pt-[1.375rem]">
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
              <button
                key={related.nodeId}
                type="button"
                onClick={() => {
                  void openDocTab(related.nodeId, "markdown", scope).catch(
                    () => undefined,
                  );
                }}
                className="text-[0.84375rem] font-medium text-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
              >
                {related.stem}
              </button>
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
}: {
  view: MarkdownReaderView;
  scope: string | null;
}): ReactElement {
  const components = useMemo<Components>(
    () => ({
      ...COMPONENTS,
      ...HEADING_COMPONENTS,
      a({ href, children, ...props }) {
        const nodeId = href ? wikiLinkNodeId(href) : null;
        if (nodeId) {
          return (
            <button
              type="button"
              onClick={() => {
                void openDocTab(nodeId, "markdown", scope).catch(() => undefined);
              }}
              className="text-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            >
              {children}
            </button>
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
    <div className="px-[4.5rem] pb-[0.625rem] pt-[1.875rem]">
      <DocHeaderBlock editorial={view.editorial} />
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
}: {
  content: ContentView;
  scope?: string | null;
}): ReactElement {
  const markdownView = useMemo(() => deriveMarkdownReaderView(content), [content]);

  if (markdownView.state !== "ready") {
    return (
      <ReaderState className={markdownView.stateToneClass}>
        {markdownView.stateMessage}
      </ReaderState>
    );
  }

  return (
    <div className="flex h-full flex-col bg-paper text-ink">
      {markdownView.truncated && (
        <div className="reader-meta border-b border-rule bg-paper-sunken px-[4.5rem] py-fg-1 text-ink-muted">
          {markdownView.truncationMessage}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <MarkdownBody view={markdownView} scope={scope} />
        <ReaderFooter editorial={markdownView.editorial} scope={scope} />
      </div>
    </div>
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
