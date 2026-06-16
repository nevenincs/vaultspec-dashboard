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

import type { ReactElement } from "react";
import { useMemo } from "react";
import type { Root } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { parseDocument } from "../../stores/server/parseDocument";
import type { ContentView } from "../../stores/server/queries";
import { useViewStore } from "../../stores/view/viewStore";
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
  // Pre-tokenization (or plain): show the raw code in a neutral pre block.
  return (
    <pre className="vs-code-fence overflow-x-auto rounded-vs-sm bg-paper-sunken p-vs-2 text-body">
      <code>{code}</code>
    </pre>
  );
}

/** The react-markdown component overrides: route wiki-links to in-app navigation,
 *  delegate fenced code to the shared highlighter, and open external links safely. */
const COMPONENTS: Components = {
  a({ href, children, ...props }) {
    const nodeId = href ? wikiLinkNodeId(href) : null;
    if (nodeId) {
      // A rewritten wiki-link: route to in-app navigation (select + open in the
      // reader), the same intent the trees use — never a page navigation.
      return (
        <button
          type="button"
          onClick={() => {
            useViewStore.getState().select(nodeId);
            useViewStore.getState().openInViewer(nodeId, "markdown");
          }}
          className="text-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          {children}
        </button>
      );
    }
    // A normal link opens in a new tab (the reader is display-only).
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
      <code className="rounded-vs-xs bg-paper-sunken px-vs-0-5 text-body">{text}</code>
    );
  },
};

const REMARK_PLUGINS = [remarkGfm, remarkWikiLink];

/** The rendered markdown body (frontmatter header + GFM body). Memoizes the
 *  parse so re-renders that do not change the text do not re-split frontmatter. */
function MarkdownBody({ text }: { text: string }): ReactElement {
  const { frontmatter, body } = useMemo(() => parseDocument(text), [text]);
  return (
    <article className="vs-markdown text-body text-ink">
      <FrontmatterHeader frontmatter={frontmatter} />
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        urlTransform={urlTransform}
        components={COMPONENTS}
      >
        {body}
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
export function MarkdownReader({ content }: { content: ContentView }): ReactElement {
  if (content.loading) {
    return <div className="p-vs-3 text-body text-ink-faint">Loading document…</div>;
  }
  if (content.errored) {
    return (
      <div className="p-vs-3 text-body text-state-broken">
        The document could not be loaded.
      </div>
    );
  }
  if (content.degraded) {
    const reason = content.reasons.structural;
    return (
      <div className="p-vs-3 text-body text-ink-muted">
        Document unavailable{reason ? `: ${reason}` : ""}.
      </div>
    );
  }
  if (!content.available || content.text.length === 0) {
    return (
      <div className="p-vs-3 text-body text-ink-faint">This document is empty.</div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      {content.truncated && (
        <div className="border-b border-rule bg-paper-sunken px-vs-3 py-vs-1 text-label text-ink-muted">
          Truncated to the first {content.truncated.returned_bytes.toLocaleString()} of{" "}
          {content.truncated.total_bytes.toLocaleString()} bytes — open the file
          directly for the full document.
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto p-vs-3">
        <MarkdownBody text={content.text} />
      </div>
    </div>
  );
}
