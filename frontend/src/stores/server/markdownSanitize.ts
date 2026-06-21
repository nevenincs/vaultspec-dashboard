// Editorial reader sanitization (document-reader hardening campaign).
//
// The "no-noise editorial simplicity" directive: the read-mode markdown reader
// renders ONLY user-facing prose. Two transforms run on the served body before it
// reaches the reader projection (deriveMarkdownReaderView), so the reader stays
// dumb chrome (dashboard-layer-ownership) and the rules are unit- and
// corpus-tested:
//
//   1. Heading sanitization — every heading at every level (H1..H6, plus the H1
//      lifted into the editorial title/dek) renders as PLAIN TEXT. Inline markdown
//      (`code`, **bold**, __bold__, *em*, _em_, ~~strike~~, ==mark==, links, wiki
//      links, images, HTML tags, backslash escapes) is stripped to its text. A
//      title like "`foo` adr: `bar` | (**status:** `accepted`)" becomes
//      "foo adr: bar | (status: accepted)".
//   2. Comment / non-user-facing removal — HTML comments (`<!-- ... -->`, single-
//      or multi-line, e.g. the vaultspec template-annotation blocks) are removed in
//      READ mode. Edit mode shows the raw body untouched (it edits content.text
//      directly), so authors still see them.
//
// Fenced code blocks are preserved verbatim: a `#` line or a `<!-- -->` inside a
// fence is literal code, never a heading or a comment.

/** Strip inline markdown emphasis/code/link/HTML syntax from a single line of
 *  text, returning the plain user-facing text. Intra-word underscores
 *  (`snake_case`) are preserved — CommonMark does not treat them as emphasis. */
export function sanitizeHeadingText(raw: string): string {
  let s = raw;

  // Images first (`![alt](url)` -> alt), then links so the leading `!` is gone.
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Wiki links: [[target|alias]] / [[target]] -> alias (or target).
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, alias) =>
    (alias ?? target).trim(),
  );
  // Inline links [text](url) and reference links [text][id] -> text.
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  s = s.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1");

  // Inline code: drop every backtick run, keeping the inner text.
  s = s.replace(/`+/g, "");

  // Emphasis, widest markers first so the inner pass does not re-wrap.
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, "$1"); // ***bold italic***
  s = s.replace(/___(.+?)___/g, "$1");
  s = s.replace(/\*\*(.+?)\*\*/g, "$1"); // **bold**
  s = s.replace(/(?<![\p{L}\p{N}])__(.+?)__(?![\p{L}\p{N}])/gu, "$1"); // __bold__
  s = s.replace(/\*(.+?)\*/g, "$1"); // *em*
  // _em_ only at word boundaries — never inside snake_case identifiers.
  s = s.replace(/(?<![\p{L}\p{N}])_(.+?)_(?![\p{L}\p{N}])/gu, "$1");
  s = s.replace(/~~(.+?)~~/g, "$1"); // ~~strike~~
  s = s.replace(/==(.+?)==/g, "$1"); // ==highlight==

  // Real HTML tags (known element names, or any tag bearing attributes or a
  // closing slash). A bare placeholder like <path> or <id> is kept as literal
  // text — it is meaningful content, not formatting.
  s = s.replace(
    /<\/?(?:a|abbr|b|blockquote|br|code|del|div|em|h[1-6]|hr|i|img|ins|kbd|li|mark|ol|p|pre|q|s|samp|small|span|strong|sub|sup|table|tbody|td|th|thead|tr|u|ul|var)\b[^>]*>/gi,
    "",
  );
  s = s.replace(/<[A-Za-z][^>]*(?:=|\/)[^>]*>/g, "");

  // Unescape markdown backslash escapes (\*, \_, \`, …) to the literal character.
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!~>|])/g, "$1");

  // Collapse the whitespace the strips may have left.
  return s.replace(/\s+/g, " ").trim();
}

/** The vaultspec H1 title template is `{feature} {doctype}: {narrative} | (status:
 *  {x})`. The clean editorial title is the narrative — the doc-type already shows
 *  as the reader eyebrow and the status as the meta line, so neither belongs in the
 *  headline. */
const VAULT_DOCTYPES = "adr|audit|plan|research|reference|exec|index|spec|brainstorm";

/**
 * Reduce a document's H1 to a clean, human-readable editorial title: strip inline
 * markdown (via sanitizeHeadingText), drop a trailing `| (status: …)` metadata
 * block, strip the `{feature} {doctype}:` template prefix down to the narrative,
 * and capitalize. Non-conforming H1s (e.g. an exec step's action sentence) keep
 * their text — only the markdown and any trailing status block are removed.
 */
export function deriveEditorialTitle(raw: string): string {
  let s = sanitizeHeadingText(raw);
  // Trailing pipe-delimited status / parenthetical metadata.
  s = s.replace(/\s*\|\s*\(?\s*status\b[^)]*\)?\s*$/i, "");
  s = s.replace(/\s*\|\s*\([^)]*\)\s*$/, "");
  // The vaultspec template prefix "{feature} {doctype}: " -> narrative.
  const prefix = new RegExp(
    `^[\\p{L}\\p{N}][\\p{L}\\p{N}-]*\\s+(?:${VAULT_DOCTYPES})\\s*:\\s*(.+)$`,
    "iu",
  );
  const m = prefix.exec(s);
  if (m && m[1].trim()) s = m[1].trim();
  s = s.trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** True when a line opens a fenced code block (``` or ~~~, up to 3 spaces indent).
 *  Returns the fence marker char, or null. */
function fenceMarker(line: string): "`" | "~" | null {
  const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
  if (!m) return null;
  return m[1][0] === "`" ? "`" : "~";
}

/**
 * Sanitize a served markdown body for the READ-mode reader: strip HTML comments
 * (single- and multi-line) and rewrite every ATX heading line to plain text —
 * both outside fenced code blocks, which are passed through verbatim. Pure and
 * idempotent. Edit mode does not use this (it shows the raw body).
 */
export function sanitizeReaderBody(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inFence = false;
  let fenceChar: "`" | "~" | null = null;
  let inComment = false;

  // Push a line, collapsing consecutive blank lines OUTSIDE fences (comment
  // removal can leave stray blanks; multiple blanks are insignificant in
  // markdown). Fence content is pushed directly and never collapsed.
  const push = (line: string) => {
    if (line.trim() === "" && out.length > 0 && out[out.length - 1].trim() === "") {
      return;
    }
    out.push(line);
  };

  for (let line of lines) {
    // Fence handling takes precedence (when not mid-comment): toggle on the
    // opening marker, off on a matching closing marker, and pass the line through.
    if (!inComment) {
      const marker = fenceMarker(line);
      if (marker) {
        if (!inFence) {
          inFence = true;
          fenceChar = marker;
        } else if (
          fenceChar &&
          new RegExp(`^\\s{0,3}\\${fenceChar}{3,}\\s*$`).test(line)
        ) {
          inFence = false;
          fenceChar = null;
        }
        out.push(line);
        continue;
      }
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    // Continuation of a multi-line comment: drop until its `-->` close.
    if (inComment) {
      const end = line.indexOf("-->");
      if (end === -1) continue; // whole line still inside the comment
      line = line.slice(end + 3);
      inComment = false;
    }

    // Remove every complete inline comment on the line.
    line = line.replace(/<!--[\s\S]*?-->/g, "");

    // An unterminated `<!--` opens a multi-line comment: keep the text before it.
    const open = line.indexOf("<!--");
    if (open !== -1 && line.indexOf("-->", open) === -1) {
      line = line.slice(0, open);
      inComment = true;
    }

    // ATX heading: rewrite its text to plain (strip a closing `#` sequence too).
    const heading = /^(\s{0,3})(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const text = sanitizeHeadingText(heading[3]);
      push(text ? `${heading[1]}${heading[2]} ${text}` : `${heading[1]}${heading[2]}`);
      continue;
    }

    push(line);
  }

  return out.join("\n");
}
