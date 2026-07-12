import type { ChangeEvent, KeyboardEventHandler, ReactElement, Ref } from "react";
import { useState } from "react";

import type { TokenLine } from "./useHighlighter";
import { useTokenLines } from "./useHighlighter";

export function splitHighlightedTextLines(
  text: string,
  { dropFinalNewline = false }: { dropFinalNewline?: boolean } = {},
): string[] {
  const source = dropFinalNewline ? text.replace(/\n$/, "") : text;
  return source.length === 0 ? [""] : source.split("\n");
}

/** Render one tokenized source line, degrading to the raw text while Shiki loads. */
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
        <span
          key={i}
          data-highlight-token
          style={{
            color: token.color,
            ...(token.fontStyle && token.fontStyle & 1 ? { fontStyle: "italic" } : {}),
            ...(token.fontStyle && token.fontStyle & 2 ? { fontWeight: 700 } : {}),
            ...(token.fontStyle && token.fontStyle & 4
              ? { textDecoration: "underline" }
              : {}),
          }}
        >
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
}: {
  rawLines: string[];
  tokenLines: TokenLine[] | null;
  lineClassName?: string;
}): ReactElement {
  return (
    <>
      {rawLines.map((raw, index) => (
        <span
          key={index}
          className={`block min-h-[1em] whitespace-pre-wrap break-words ${lineClassName}`}
          data-highlight-line
        >
          <HighlightedLineContent raw={raw} tokens={tokenLines?.[index]} />
        </span>
      ))}
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
}): ReactElement {
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const rawLines = splitHighlightedTextLines(value);
  const { lines: tokenLines } = useTokenLines(value, languageHint);

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
          <HighlightedTextLines rawLines={rawLines} tokenLines={tokenLines} />
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
