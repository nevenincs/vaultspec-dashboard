import type {
  CSSProperties,
  ChangeEvent,
  KeyboardEventHandler,
  ReactElement,
  Ref,
} from "react";
import { useMemo, useState } from "react";

import type { LineChange, LineMarker } from "../authoring/editorChanges";
import { lineMarkers } from "../authoring/editorChanges";
import type { TokenLine } from "./useHighlighter";
import { useTokenLines } from "./useHighlighter";

/** The change-marker tone per kind. A bar for an edit, a tick for a deletion —
 *  all three carry the diff token tier, so they theme with everything else.
 *  Exported so the read-only code viewer's gutter renders the same three tones as
 *  the editor's, and the two surfaces read identically. */
export const MARKER_TONE: Record<LineMarker["kind"], string> = {
  added: "bg-diff-add",
  modified: "bg-diff-modified",
  removed: "bg-diff-remove",
};

/** One line's change mark, laid out INSIDE the line's flow block so it tracks the
 *  line through soft-wrap and scroll for free — a bar down the left inset for an
 *  edit, a short tick at the top edge for a deletion sitting above this line. The
 *  inset (`left`) sits within the editor's existing 1.5rem left padding, so the
 *  gutter reserves no extra width. */
function ChangeMarker({ marker }: { marker: LineMarker }): ReactElement {
  const tone = MARKER_TONE[marker.kind];
  if (marker.tick) {
    return (
      <span
        aria-hidden
        data-change-marker="removed"
        className={`pointer-events-none absolute left-[-0.9rem] top-0 h-[0.125rem] w-[0.5rem] -translate-y-1/2 rounded-fg-pill ${tone}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      data-change-marker={marker.kind}
      className={`pointer-events-none absolute bottom-0 left-[-0.9rem] top-0 w-[0.1875rem] rounded-fg-pill ${tone}`}
    />
  );
}

export function splitHighlightedTextLines(
  text: string,
  { dropFinalNewline = false }: { dropFinalNewline?: boolean } = {},
): string[] {
  const source = dropFinalNewline ? text.replace(/\n$/, "") : text;
  return source.length === 0 ? [""] : source.split("\n");
}

/** Render one tokenized source line, degrading to the raw text while Shiki loads.
 *
 *  Tokens are multi-theme (`defaultColor: false`), so a token carries no `color`
 *  and no `fontStyle` — both ride in `htmlStyle` as one custom property per theme
 *  and per property (`--shiki-dark`, `--shiki-dark-font-weight`, …), because the
 *  themes may disagree. `styles.css` maps the active `[data-theme]` onto the
 *  matching set, which is what lets a theme flip repaint without re-tokenizing.
 *  Emphasis therefore must NOT be re-derived from `token.fontStyle` here: it is
 *  undefined under multi-theme, and doing so silently drops bold headings and
 *  italic emphasis in the Markdown editor. */
export function HighlightedLineContent({
  raw,
  tokens,
}: {
  raw: string;
  tokens?: TokenLine | null;
}): ReactElement {
  if (!tokens || tokens.length === 0) return <>{raw || " "}</>;
  return (
    <>
      {tokens.map((token, i) => (
        <span key={i} data-highlight-token style={token.htmlStyle as CSSProperties}>
          {token.content || " "}
        </span>
      ))}
    </>
  );
}

export function HighlightedTextLines({
  rawLines,
  tokenLines,
  lineClassName = "",
  markersByLine,
}: {
  rawLines: string[];
  tokenLines: TokenLine[] | null;
  lineClassName?: string;
  /** Per-line change marks (editor-change-fidelity D5). A marked line renders its
   *  bar/tick as a flow child, so the mark tracks the line through wrap + scroll. */
  markersByLine?: Map<number, LineMarker>;
}): ReactElement {
  return (
    <>
      {rawLines.map((raw, index) => {
        const marker = markersByLine?.get(index);
        return (
          <span
            key={index}
            className={`relative block min-h-[1em] whitespace-pre-wrap break-words ${lineClassName}`}
            data-highlight-line
          >
            {marker && <ChangeMarker marker={marker} />}
            <HighlightedLineContent raw={raw} tokens={tokenLines?.[index]} />
          </span>
        );
      })}
    </>
  );
}

export function HighlightedTextarea({
  value,
  languageHint,
  onChange,
  ariaLabel,
  inputRef,
  onKeyDown,
  changes,
}: {
  value: string;
  languageHint: string | null;
  onChange: (value: string) => void;
  ariaLabel: string;
  /** Forwarded textarea ref — lets a composing toolbar read/set the selection to
   *  apply formatting around it. */
  inputRef?: Ref<HTMLTextAreaElement>;
  /** Keydown handler on the textarea — for the editor's widget-intrinsic (Class-B)
   *  formatting accelerators, kept in the component, never the keymap registry. */
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
  /** The dirty-diff of the draft against the saved base (editor-change-fidelity
   *  D5). When provided, changed lines carry a gutter mark; omitted → no gutter. */
  changes?: LineChange[];
}): ReactElement {
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const rawLines = splitHighlightedTextLines(value);
  const { lines: tokenLines } = useTokenLines(value, languageHint);
  const markersByLine = useMemo(
    () => (changes && changes.length > 0 ? lineMarkers(changes) : undefined),
    [changes],
  );

  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden bg-paper font-mono text-body leading-relaxed text-ink"
      data-highlighted-editor
    >
      <pre
        aria-hidden
        className="pointer-events-none absolute inset-0 m-0 overflow-hidden px-fg-6 py-fg-3"
        data-highlighted-editor-layer
      >
        <code
          className="block whitespace-pre-wrap break-words"
          style={{ marginLeft: -scroll.left, marginTop: -scroll.top }}
        >
          <HighlightedTextLines
            rawLines={rawLines}
            tokenLines={tokenLines}
            markersByLine={markersByLine}
          />
        </code>
      </pre>
      <textarea
        ref={inputRef}
        className="relative z-10 h-full w-full resize-none border-none bg-transparent px-fg-6 py-fg-3 font-mono text-body leading-relaxed text-transparent outline-none"
        value={value}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
          onChange(event.target.value)
        }
        onKeyDown={onKeyDown}
        onScroll={(event) =>
          setScroll({
            top: event.currentTarget.scrollTop,
            left: event.currentTarget.scrollLeft,
          })
        }
        spellCheck={false}
        aria-label={ariaLabel}
        style={{ caretColor: "var(--color-ink)" }}
      />
    </div>
  );
}
