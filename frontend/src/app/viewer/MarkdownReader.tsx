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
  type FrontmatterHeaderView,
  type FrontmatterTagCategory,
  type MarkdownReaderView,
} from "../../stores/server/queries";
import { openDocTab } from "../../stores/view/tabs";
import { StatusDot, categoryColorVar, type Category } from "../kit";
import { remarkWikiLink, wikiLinkNodeId } from "./remarkWikiLink";
import { useHighlightedHast } from "./useHighlighter";

/** Preserve the `vaultspec:` wiki-link scheme through react-markdown's URL
 *  sanitizer (which strips unknown schemes by default). */
function urlTransform(url: string): string {
  return url;
}

/** Render a Shiki HAST tree to React elements through the jsx runtime. */
function hastToReact(hast: Root): ReactElement {
  return toJsxRuntime(hast, { Fragment, jsx, jsxs }) as ReactElement;
}

// --- editorial document model (board 259:838 DocHeader + footer) ---------------
//
// The binding reader lifts the doc-type eyebrow, title, dek, and meta out of the
// raw body into a structured header, and moves tags/related to a footer. These are
// pure app-layer projections over the already-served content (the reader still
// fetches nothing) — derived from the parsed frontmatter and a light split of the
// body's leading H1 + dek paragraph.

/** The doc-type directory tags that earn the header eyebrow (the rest stay footer
 *  chips). Mirrors the vault directory taxonomy. */
const DOCTYPE_EYEBROW: Partial<Record<FrontmatterTagCategory, string>> = {
  adr: "Decision",
  audit: "Audit",
  exec: "Step",
  index: "Index",
  plan: "Plan",
  research: "Research",
};

function eyebrowFor(
  fm: FrontmatterHeaderView | null,
): { label: string; category: Category } | null {
  if (!fm) return null;
  for (const tag of fm.tags) {
    const label = tag.category ? DOCTYPE_EYEBROW[tag.category] : undefined;
    if (tag.category && label) return { label, category: tag.category };
  }
  return null;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `2026-06-16` → `16 June 2026` (Reader/Meta date form). */
function formatLongDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${Number(d)} ${MONTHS[Number(mo) - 1] ?? mo} ${y}`;
}

/** Estimated reading minutes from the body word count (~200 wpm, floor 1). */
function readingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Split the body into the editorial title (leading H1), dek (the paragraph that
 *  immediately follows it), and the remaining markdown to render. A body with no
 *  leading H1 keeps everything in `rest`. */
function splitEditorial(body: string): {
  title: string | null;
  dek: string | null;
  rest: string;
} {
  const lines = body.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  let title: string | null = null;
  const h1 = /^#\s+(.+?)\s*$/.exec(lines[i] ?? "");
  if (h1) {
    title = h1[1].trim();
    i++;
  }
  while (i < lines.length && lines[i].trim() === "") i++;
  let dek: string | null = null;
  const next = lines[i]?.trim() ?? "";
  const isProse = next !== "" && !/^(#{1,6}\s|[-*>|]|\d+\.\s|```)/.test(next);
  if (title && isProse) {
    const dekLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      dekLines.push(lines[i].trim());
      i++;
    }
    dek = dekLines.join(" ");
  }
  const rest = lines.slice(i).join("\n").replace(/^\n+/, "");
  return { title, dek, rest };
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

/** The editorial DocHeader block: doc-type eyebrow, serif title, italic dek, and
 *  the date · reading-time · status meta line (board 259:838). */
function DocHeaderBlock({
  view,
  title,
  dek,
  body,
}: {
  view: MarkdownReaderView;
  title: string | null;
  dek: string | null;
  body: string;
}): ReactElement {
  const eyebrow = eyebrowFor(view.frontmatter);
  const date = formatLongDate(
    view.frontmatter?.dates.find((d) => d.label === "created")?.value,
  );
  const meta = [date, `${readingMinutes(body)} min read`, view.status].filter(
    (part): part is string => Boolean(part),
  );
  return (
    <header className="flex flex-col gap-[11px]">
      {eyebrow && (
        <div className="flex items-center gap-[7px]">
          <StatusDot category={eyebrow.category} />
          <span
            className="reader-eyebrow"
            style={{ color: categoryColorVar(eyebrow.category) }}
          >
            {eyebrow.label}
          </span>
        </div>
      )}
      {title && <h1 className="reader-title text-ink">{title}</h1>}
      {dek && <p className="reader-dek text-ink-muted">{dek}</p>}
      {meta.length > 0 && (
        <p className="reader-meta text-ink-muted">
          {meta.map((part, idx) => (
            <span key={part}>
              {idx > 0 && <span className="px-[10px] text-ink-faint">·</span>}
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
  view,
  scope,
}: {
  view: MarkdownReaderView;
  scope: string | null;
}): ReactElement | null {
  const fm = view.frontmatter;
  if (!fm) return null;
  const footerTags = fm.tags.filter(
    (tag) => !(tag.category && DOCTYPE_EYEBROW[tag.category]),
  );
  if (footerTags.length === 0 && fm.related.length === 0) return null;
  return (
    <footer className="flex flex-col gap-fg-4 px-[72px] pb-[30px] pt-[22px]">
      <div className="h-px w-full bg-rule" />
      {footerTags.length > 0 && (
        <div className="flex items-center gap-fg-3">
          <span className="reader-meta w-16 shrink-0 text-ink-muted">Tagged</span>
          <div className="flex flex-1 flex-wrap gap-[7px]">
            {footerTags.map((tag) => (
              <span
                key={tag.label}
                className="rounded-full bg-paper-sunken px-[10px] py-[4px] text-[11px] text-ink-muted"
              >
                {tag.label}
              </span>
            ))}
          </div>
        </div>
      )}
      {fm.related.length > 0 && (
        <div className="flex items-center gap-fg-3">
          <span className="reader-meta w-16 shrink-0 text-ink-muted">Related</span>
          <div className="flex flex-1 flex-wrap gap-x-fg-4 gap-y-fg-1-5">
            {fm.related.map((related) => (
              <button
                key={related.nodeId}
                type="button"
                onClick={() => {
                  void openDocTab(related.nodeId, "markdown", scope).catch(
                    () => undefined,
                  );
                }}
                className="text-[13.5px] font-medium text-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
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
  const { title, dek, rest } = useMemo(() => splitEditorial(view.body), [view.body]);
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
    <div className="px-[72px] pb-[10px] pt-[30px]">
      <DocHeaderBlock view={view} title={title} dek={dek} body={rest} />
      <div className="my-fg-4 h-px w-full bg-rule" />
      <article className="vs-markdown">
        <Markdown
          remarkPlugins={REMARK_PLUGINS}
          urlTransform={urlTransform}
          components={components}
        >
          {rest}
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
      <ReaderState tone={markdownView.stateTone}>
        {markdownView.stateMessage}
      </ReaderState>
    );
  }

  return (
    <div className="flex h-full flex-col bg-paper text-ink">
      {markdownView.truncated && (
        <div className="reader-meta border-b border-rule bg-paper-sunken px-[72px] py-fg-1 text-ink-muted">
          Truncated to the first{" "}
          {markdownView.truncated.returned_bytes.toLocaleString()} of{" "}
          {markdownView.truncated.total_bytes.toLocaleString()} bytes — open the file
          directly for the full document.
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <MarkdownBody view={markdownView} scope={scope} />
        <ReaderFooter view={markdownView} scope={scope} />
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
