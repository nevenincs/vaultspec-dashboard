// The vault frontmatter parser — a small, total parser for the leading YAML
// frontmatter block of a `.vault/` document (`tags`, `date`, `modified`, and
// `related: ['[[wiki-link]]']`). It lives in the stores layer because both a
// stores consumer (the read-side link-resolution derivation in `queries.ts`)
// and the app-layer markdown reader chrome (`app/viewer/FrontmatterHeader.tsx`)
// parse the same shape; the parser is the model, the header is one view of it.
// Keeping it here honors the one-way layer boundary (app -> stores -> engine):
// the app re-imports this pure function rather than the stores reaching up into
// the app for it (dashboard-layer-ownership). The vault frontmatter shape is
// fixed and simple, so this handles it without a YAML dependency; an
// unrecognized or malformed block degrades to "no frontmatter".

/** The parsed frontmatter fields. */
export interface Frontmatter {
  tags: string[];
  date?: string;
  modified?: string;
  /** Related document stems, recovered from the `[[stem]]` wiki-link forms. */
  related: string[];
}

/** A parsed document: its frontmatter (or null when absent) and the body markdown
 *  with the frontmatter block stripped. */
export interface ParsedDocument {
  frontmatter: Frontmatter | null;
  body: string;
}

/** Strip surrounding single/double quotes from a scalar YAML value. */
function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Recover the stem from a `[[stem]]` / `[[stem|label]]` wiki-link list item, or
 *  return the bare value when it is not bracketed. */
function relatedStem(value: string): string {
  const m = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/.exec(value);
  return (m ? m[1] : value).trim();
}

/**
 * Parse a document into its leading frontmatter block + body. Handles exactly the
 * vault frontmatter shape: a leading `---` fence, then `tags:`/`related:` block
 * sequences (`- value` list items) and `date:`/`modified:` scalars, closed by a
 * `---` fence. A document with no leading fence (general markdown) parses as
 * `{ frontmatter: null, body: <whole text> }`. Deliberately small and total — it
 * never throws; an unrecognized line inside the block is ignored.
 */
export function parseDocument(text: string): ParsedDocument {
  // A frontmatter block is a leading `---` line, content, and a closing `---`.
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { frontmatter: null, body: text };

  const block = match[1];
  const body = text.slice(match[0].length);
  const tags: string[] = [];
  const related: string[] = [];
  let date: string | undefined;
  let modified: string | undefined;
  let listKey: "tags" | "related" | null = null;

  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    if (line.length === 0) continue;
    const listItem = /^\s*-\s+(.*)$/.exec(line);
    if (listItem && listKey) {
      const value = unquote(listItem[1]);
      if (listKey === "tags") tags.push(value.replace(/^#/, ""));
      else related.push(relatedStem(value));
      continue;
    }
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, valueRaw] = kv;
    const value = valueRaw.trim();
    if (key === "tags" || key === "related") {
      listKey = key;
      // An inline list (`tags: [a, b]`) is also tolerated.
      if (value.startsWith("[") && value.endsWith("]")) {
        const items = value.slice(1, -1).split(",").map(unquote).filter(Boolean);
        if (key === "tags") items.forEach((t) => tags.push(t.replace(/^#/, "")));
        else items.forEach((r) => related.push(relatedStem(r)));
        listKey = null;
      }
    } else {
      listKey = null;
      if (key === "date") date = unquote(value);
      else if (key === "modified") modified = unquote(value);
    }
  }

  return { frontmatter: { tags, date, modified, related }, body };
}
