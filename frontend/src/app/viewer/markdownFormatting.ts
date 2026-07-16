// Pure markdown formatting-insertion helper for the document editor's toolbar
// (document-editor-redesign ADR). Each command transforms the current textarea
// selection and returns the new body plus the caret range to restore — no React,
// no DOM, no store access, so it is exhaustively unit-testable and the editor slice
// stays the single owner of the draft (the caller feeds the result to
// `updateEditorDraft` and restores the selection on the textarea).
//
// Two command shapes: INLINE wrap (emphasis, code, link, wiki-link) brackets the
// selection with markers; LINE prefix (heading, lists, quote) prepends a marker to
// each selected line. When the selection is empty, an inline command inserts a
// placeholder and selects it so the next keystroke replaces it.

export type MarkdownFormatCommand =
  | "bold"
  | "italic"
  | "code"
  | "link"
  | "wikiLink"
  | "heading"
  | "bulletList"
  | "orderedList"
  | "quote";

export interface MarkdownSelection {
  /** The full document body. */
  text: string;
  /** The selection start offset (inclusive). */
  selStart: number;
  /** The selection end offset (exclusive). */
  selEnd: number;
}

export interface MarkdownEditResult {
  text: string;
  selStart: number;
  selEnd: number;
}

interface InlineSpec {
  before: string;
  after: string;
  token: keyof MarkdownFormattingPlaceholders;
}

const INLINE: Partial<Record<MarkdownFormatCommand, InlineSpec>> = {
  bold: { before: "**", after: "**", token: "bold" },
  italic: { before: "*", after: "*", token: "italic" },
  code: { before: "`", after: "`", token: "code" },
  wikiLink: { before: "[[", after: "]]", token: "document" },
};

export interface MarkdownFormattingPlaceholders {
  bold: string;
  italic: string;
  code: string;
  document: string;
  linkText: string;
  linkUrl: string;
}

const LINE_PREFIX: Partial<Record<MarkdownFormatCommand, string>> = {
  heading: "# ",
  bulletList: "- ",
  quote: "> ",
};

/** Clamp an offset into `[0, length]` and order the pair — a defensive guard so a
 *  stale or inverted selection never indexes out of the string. */
function normalizeRange(text: string, start: number, end: number): [number, number] {
  const clamp = (n: number) => Math.max(0, Math.min(text.length, Math.trunc(n) || 0));
  const a = clamp(start);
  const b = clamp(end);
  return a <= b ? [a, b] : [b, a];
}

function applyInline(
  spec: InlineSpec,
  placeholders: MarkdownFormattingPlaceholders,
  text: string,
  start: number,
  end: number,
): MarkdownEditResult {
  const selected = text.slice(start, end);
  const body = selected.length > 0 ? selected : placeholders[spec.token];
  const next = text.slice(0, start) + spec.before + body + spec.after + text.slice(end);
  // Select the body (the wrapped text or the placeholder) so it is highlighted and
  // ready to overtype.
  const bodyStart = start + spec.before.length;
  return { text: next, selStart: bodyStart, selEnd: bodyStart + body.length };
}

/** A markdown link is the one inline command with two slots; the caret lands on the
 *  `url` slot so the author types the target immediately, with the label preserved
 *  (or a `text` placeholder when the selection is empty). */
function applyLink(
  text: string,
  start: number,
  end: number,
  placeholders: MarkdownFormattingPlaceholders,
): MarkdownEditResult {
  const selected = text.slice(start, end);
  const label = selected.length > 0 ? selected : placeholders.linkText;
  const url = placeholders.linkUrl;
  const next = `${text.slice(0, start)}[${label}](${url})${text.slice(end)}`;
  const urlStart = start + 1 + label.length + 2; // "[" + label + "]("
  return { text: next, selStart: urlStart, selEnd: urlStart + url.length };
}

/** Expand a selection to whole lines, then prefix each line. `orderedList` numbers
 *  the lines from 1; the other prefixes are constant. The returned selection spans
 *  the prefixed block so a repeat press keeps the same lines targeted. */
function applyLinePrefix(
  command: MarkdownFormatCommand,
  text: string,
  start: number,
  end: number,
): MarkdownEditResult {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineEndIdx = text.indexOf("\n", end);
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
  const block = text.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const prefixed = lines
    .map((line, i) =>
      command === "orderedList"
        ? `${i + 1}. ${line}`
        : `${LINE_PREFIX[command] ?? ""}${line}`,
    )
    .join("\n");
  const next = text.slice(0, lineStart) + prefixed + text.slice(lineEnd);
  return { text: next, selStart: lineStart, selEnd: lineStart + prefixed.length };
}

/** Apply a formatting command to the selection, returning the new body and the
 *  caret range to restore. Pure: the caller owns the textarea and the draft. */
export function applyMarkdownFormat(
  command: MarkdownFormatCommand,
  selection: MarkdownSelection,
  placeholders: MarkdownFormattingPlaceholders,
): MarkdownEditResult {
  const [start, end] = normalizeRange(
    selection.text,
    selection.selStart,
    selection.selEnd,
  );
  const text = selection.text;
  if (command === "link") return applyLink(text, start, end, placeholders);
  const inline = INLINE[command];
  if (inline) return applyInline(inline, placeholders, text, start, end);
  return applyLinePrefix(command, text, start, end);
}
