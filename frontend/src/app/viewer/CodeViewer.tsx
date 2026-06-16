// The read-only, syntax-highlighted code-file viewer (review-rail-viewers ADR
// P05.S22 / S23 / S24).
//
// A DISPLAY-ONLY review surface — not an editor, not a repo browser. It takes the
// tiers-derived content view the stores layer supplies (it fetches nothing,
// dashboard-layer-ownership), picks the grammar via the SHARED highlighter (one
// tokenizer with the markdown reader's fences), and renders highlighted lines with
// a line-number gutter and a monospace path header. The line list is VIRTUALIZED
// (only the visible window renders) so a large — already byte-capped — file scrolls
// cheaply; there are no editing affordances. Degraded / empty / truncated / error
// states read from the content view + the truncated block. All color comes from
// the token-bound theme (themes-are-oklch / warmth-lives-in-tokens).

import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ContentView } from "../../stores/server/queries";
import type { TokenLine } from "./useHighlighter";
import { useTokenLines } from "./useHighlighter";

/** Fixed line-row height (px) — a monospace code row. Drives the windowed math:
 *  a fixed height lets the viewer compute the visible range from scrollTop without
 *  measuring each row. */
const LINE_HEIGHT = 20;
/** Extra rows rendered above/below the viewport so a fast scroll never flashes
 *  blank before the next window paints. */
const OVERSCAN = 12;

/** Render one tokenized line's spans, each colored by its theme token (the
 *  `var(--color-*)` foreground the token-bound theme emits). A plain line (no
 *  tokens) renders its raw text. */
function TokenizedLine({ tokens }: { tokens: TokenLine }): ReactElement {
  return (
    <>
      {tokens.map((token, i) => (
        <span
          key={i}
          style={{
            color: token.color,
            ...(token.fontStyle === 1 ? { fontStyle: "italic" } : {}),
            ...(token.fontStyle === 2 ? { fontWeight: 700 } : {}),
          }}
        >
          {token.content}
        </span>
      ))}
    </>
  );
}

/** The windowed line list: renders only the visible range (plus overscan) of the
 *  line array, absolutely positioned within a full-height spacer, with a sticky
 *  line-number gutter. A byte-capped file's line count is bounded, and only the
 *  viewport's rows mount, so scrolling stays cheap. */
function CodeLines({
  rawLines,
  tokenLines,
}: {
  rawLines: string[];
  tokenLines: TokenLine[] | null;
}): ReactElement {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Measure the viewport height (and re-measure on resize) so the visible-window
  // math tracks the actual panel size, not a fixed guess.
  const measure = useCallback((el: HTMLDivElement | null) => {
    scrollerRef.current = el;
    if (el) setViewportH(el.clientHeight || 600);
  }, []);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight || 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = rawLines.length;
  const first = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewportH / LINE_HEIGHT) + OVERSCAN * 2;
  const last = Math.min(total, first + visibleCount);
  const gutterWidth = `${String(total).length + 1}ch`;

  return (
    <div
      ref={measure}
      className="min-h-0 flex-1 overflow-auto bg-paper-sunken font-mono text-body"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      role="region"
      aria-label="file contents"
    >
      <div style={{ height: total * LINE_HEIGHT, position: "relative" }}>
        {rawLines.slice(first, last).map((raw, i) => {
          const lineNo = first + i;
          return (
            <div
              key={lineNo}
              className="flex whitespace-pre"
              style={{
                position: "absolute",
                top: lineNo * LINE_HEIGHT,
                height: LINE_HEIGHT,
                lineHeight: `${LINE_HEIGHT}px`,
                left: 0,
                right: 0,
              }}
            >
              <span
                className="sticky left-0 select-none pr-fg-2 text-right text-ink-faint"
                style={{ width: gutterWidth, flex: "0 0 auto" }}
                aria-hidden
              >
                {lineNo + 1}
              </span>
              <code className="px-fg-1">
                {tokenLines && tokenLines[lineNo] ? (
                  <TokenizedLine tokens={tokenLines[lineNo]} />
                ) : (
                  raw
                )}
              </code>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The code viewer surface. Renders the highlighted, line-numbered file when
 * content is available, and the designed degraded / empty / truncated / error
 * states otherwise — all read from the tiers-derived `ContentView`. Display-only:
 * no editing, no in-viewer file navigation.
 */
export function CodeViewer({ content }: { content: ContentView }): ReactElement {
  // Hooks run unconditionally (rules-of-hooks): tokenize whatever text is held
  // (empty string while loading/degraded), then branch on the view state below.
  const text = content.available ? content.text : "";
  const { lines: tokenLines } = useTokenLines(text, content.languageHint);

  if (content.loading) {
    return <div className="p-fg-3 text-body text-ink-faint">Loading file…</div>;
  }
  if (content.errored) {
    return (
      <div className="p-fg-3 text-body text-state-broken">
        The file could not be loaded.
      </div>
    );
  }
  if (content.degraded) {
    const reason = content.reasons.structural;
    return (
      <div className="p-fg-3 text-body text-ink-muted">
        File unavailable{reason ? `: ${reason}` : ""}.
      </div>
    );
  }
  if (!content.available || text.length === 0) {
    return <div className="p-fg-3 text-body text-ink-faint">This file is empty.</div>;
  }

  const rawLines = text.replace(/\n$/, "").split("\n");

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-fg-2 border-b border-rule bg-paper px-fg-3 py-fg-1">
        <span className="truncate font-mono text-label text-ink-muted">
          {content.path}
        </span>
        {content.languageHint && (
          <span className="rounded-fg-xs bg-accent-subtle px-fg-1 text-label text-accent-text">
            {content.languageHint}
          </span>
        )}
      </header>
      {content.truncated && (
        <div className="border-b border-rule bg-paper-sunken px-fg-3 py-fg-1 text-label text-ink-muted">
          Truncated to the first {content.truncated.returned_bytes.toLocaleString()} of{" "}
          {content.truncated.total_bytes.toLocaleString()} bytes — open the file
          directly for the full contents.
        </div>
      )}
      <CodeLines rawLines={rawLines} tokenLines={tokenLines} />
    </div>
  );
}
