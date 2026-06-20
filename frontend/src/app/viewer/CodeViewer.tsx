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

import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";

import { deriveCodeViewerView, type ContentView } from "../../stores/server/queries";
import {
  deriveCodeLineRowStyle,
  deriveCodeLineWindow,
  deriveCodeLineWindowPresentation,
  setCodeViewerScrollTop,
  useCodeViewerScrollTop,
} from "../../stores/view/codeViewer";
import { useElementHeight } from "../chrome/useElementWidth";
import { Badge } from "../kit";
import type { TokenLine } from "./useHighlighter";
import { useTokenLines } from "./useHighlighter";

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
  const scrollTop = useCodeViewerScrollTop();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const viewportHeight = useElementHeight(scrollerRef) ?? 600;

  const total = rawLines.length;
  const lineWindow = deriveCodeLineWindow({
    totalLines: total,
    scrollTop,
    viewportHeight,
  });
  const presentation = deriveCodeLineWindowPresentation(lineWindow);

  return (
    <div
      ref={scrollerRef}
      className={presentation.scrollerClassName}
      onScroll={(e) => setCodeViewerScrollTop(e.currentTarget.scrollTop)}
      role="region"
      aria-label={presentation.scrollerAriaLabel}
    >
      <div style={presentation.spacerStyle}>
        {rawLines.slice(lineWindow.first, lineWindow.last).map((raw, i) => {
          const lineNo = lineWindow.first + i;
          return (
            <div
              key={lineNo}
              className={presentation.rowClassName}
              style={deriveCodeLineRowStyle(lineNo, lineWindow)}
            >
              <span
                className={presentation.gutterClassName}
                style={presentation.gutterStyle}
                aria-hidden
              >
                {lineNo + 1}
              </span>
              <code className={presentation.codeClassName}>
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
  const view = deriveCodeViewerView(content);
  const { lines: tokenLines } = useTokenLines(view.text, view.languageHint);

  if (view.state !== "ready") {
    return (
      <ViewerState toneClass={view.stateToneClass}>{view.stateMessage}</ViewerState>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Board 101:2 header: the mono path, a neutral language badge (capitalized),
          and a "read-only" affordance label. */}
      <header className="flex items-center gap-fg-2 border-b border-rule bg-paper px-fg-3 py-fg-1">
        <span className="min-w-0 flex-1 truncate font-mono text-label text-ink-muted">
          {view.path}
        </span>
        {view.languageHint && (
          <Badge>
            <span className="capitalize">{view.languageHint}</span>
          </Badge>
        )}
        <span className="shrink-0 text-caption text-ink-faint">
          {view.readOnlyLabel}
        </span>
      </header>
      {view.truncationMessage && (
        <div className="border-b border-rule bg-paper-sunken px-fg-3 py-fg-1 text-label text-ink-muted">
          {view.truncationMessage}
        </div>
      )}
      <CodeLines rawLines={view.rawLines} tokenLines={tokenLines} />
    </div>
  );
}

/** A centred placeholder for the viewer's loading / empty / degraded / error
 *  states. Reads the Reader/Meta role; the tone selects the ink token. */
function ViewerState({
  children,
  toneClass,
}: {
  children: ReactNode;
  toneClass: string;
}): ReactElement {
  return (
    <div
      className={`reader-meta flex h-full items-center justify-center p-fg-6 text-center ${toneClass}`}
    >
      <p>{children}</p>
    </div>
  );
}
