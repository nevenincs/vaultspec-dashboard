// The frontmatter-aware, display-only markdown reader (review-rail-viewers ADR
// P04.S17 / S20 / S21).
//
// Renders a `.vault/` document (or general markdown) as READABLE chrome: the
// leading YAML frontmatter through the structured FrontmatterHeader (tags pills,
// date stamps, clickable related wiki-links), the body through react-markdown +
// remark-gfm (tables, task-list checkboxes — the plan checkbox/step structure —
// strikethrough, autolinks), double-bracket `[[wiki-link]]` syntax rewritten to
// in-app navigation by the custom remark plugin, and fenced code through the
// SHARED Shiki highlighter (one tokenizer with the code viewer). All chrome reads
// the existing `--color-*` tokens (themes-are-oklch / warmth-lives-in-tokens) — no
// new color. It fetches nothing: it is dumb `app/` chrome that reads the
// tiers-derived content view the stores layer supplies (dashboard-layer-ownership).

import type { ReactElement, ReactNode } from "react";
import { useMemo } from "react";
import type { Root } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  deriveMarkdownReaderView,
  type ContentView,
  type MarkdownReaderView,
} from "../../stores/server/queries";
import { openDocTab } from "../../stores/view/tabs";
import { FrontmatterHeader } from "./FrontmatterHeader";
import { remarkWikiLink, wikiLinkNodeId } from "./remarkWikiLink";
import { useHighlightedHast } from "./useHighlighter";

/** Preserve the `vaultspec:` wiki-link scheme through react-markdown's URL
 *  sanitizer (which strips unknown schemes by default); other URLs pass to the
 *  built-in safe transform via the identity here (the reader only renders trusted
 *  vault content, and external links open in a new tab below). */
function urlTransform(url: string): string {
  return url;
}

/** Render a Shiki HAST tree to React elements through the jsx runtime. */
function hastToReact(hast: Root): ReactElement {
  return toJsxRuntime(hast, { Fragment, jsx, jsxs }) as ReactElement;
}

/** A fenced code block, tokenized through the shared highlighter. While the
 *  grammar loads it shows the raw text; an unknown language renders plain. The
 *  same hook the code viewer uses, so reader fences and the viewer share one
 *  tokenizer. */
function CodeFence({
  code,
  lang,
}: {
  code: string;
  lang: string | null;
}): ReactElement {
  const { hast } = useHighlightedHast(code, lang);
  if (hast) {
    return <div className="vs-code-fence">{hastToReact(hast)}</div>;
  }
  // Pre-tokenization (or plain): show the raw code in the neutral fence surface
  // (chrome/typography supplied by the `.vs-code-fence` reader scale).
  return (
    <pre className="vs-code-fence">
      <code>{code}</code>
    </pre>
  );
}

/** The base react-markdown component overrides: delegate fenced code to the shared
 *  highlighter. Link routing is scoped per render in `MarkdownBody`. */
const COMPONENTS: Components = {
  code({ className, children }) {
    const text = String(children ?? "");
    const fenceMatch = /language-([\w+-]+)/.exec(className ?? "");
    // A fenced block carries a `language-*` class (even without a language, GFM
    // marks it). An inline code span has no newline and no language class.
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

/** The rendered markdown body (frontmatter header + GFM body). Consumes the
 *  stores-derived reader projection; link routing is scoped per render. */
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
    <article className="vs-markdown">
      <FrontmatterHeader view={view.frontmatter} scope={scope} />
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        urlTransform={urlTransform}
        components={components}
      >
        {view.body}
      </Markdown>
    </article>
  );
}

/**
 * The markdown reader surface. Renders the document body when content is
 * available, and the designed degraded / empty / error states otherwise — all
 * read from the tiers-derived `ContentView` the stores layer supplies (the reader
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
  const markdownView = useMemo(() => deriveMarkdownReaderView(content), [content.text]);

  if (content.loading) {
    return <ReaderState>Loading document…</ReaderState>;
  }
  if (content.errored) {
    return <ReaderState tone="broken">The document could not be loaded.</ReaderState>;
  }
  if (content.degraded) {
    const reason = content.reasons.structural;
    return (
      <ReaderState tone="muted">
        Document unavailable{reason ? `: ${reason}` : ""}.
      </ReaderState>
    );
  }
  if (!content.available || content.text.length === 0) {
    return <ReaderState>This document is empty.</ReaderState>;
  }
  return (
    <div className="flex h-full flex-col">
      {content.truncated && (
        <div className="reader-meta border-b border-rule bg-paper-sunken px-fg-6 py-fg-1 text-ink-muted">
          Truncated to the first {content.truncated.returned_bytes.toLocaleString()} of{" "}
          {content.truncated.total_bytes.toLocaleString()} bytes — open the file
          directly for the full document.
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto px-fg-6 py-fg-4">
        <MarkdownBody view={markdownView} scope={scope} />
      </div>
    </div>
  );
}

/** A centred reader placeholder for the loading / empty / degraded / error
 *  states (Reader states board 271:1121). Reads the binding Reader/Meta role; the
 *  tone selects the ink token (faint for empty/loading, muted for degraded,
 *  state-broken for error). */
function ReaderState({
  children,
  tone = "faint",
}: {
  children: ReactNode;
  tone?: "faint" | "muted" | "broken";
}): ReactElement {
  const inkClass =
    tone === "broken"
      ? "text-state-broken"
      : tone === "muted"
        ? "text-ink-muted"
        : "text-ink-faint";
  return (
    <div
      className={`reader-meta flex h-full items-center justify-center p-fg-6 text-center ${inkClass}`}
    >
      <p>{children}</p>
    </div>
  );
}
