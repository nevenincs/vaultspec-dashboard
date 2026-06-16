// The structured frontmatter header for the markdown reader (review-rail-viewers
// ADR P04.S18).
//
// A `.vault/` document leads with a YAML frontmatter block carrying `tags`,
// `date`, `modified`, and `related: ['[[wiki-link]]']`. The reader renders that
// block as STRUCTURED CHROME — tags as pills, dates as stamps, related as
// clickable wiki-links — never as raw YAML text, which is what makes the reader
// vaultspec-aware rather than a generic markdown box. The vault frontmatter shape
// is fixed and simple, so a small focused parser handles it without adding a YAML
// dependency; an unrecognized or malformed block degrades to "no frontmatter"
// (the body still renders).
//
// All chrome reads the existing `--color-*` token surface (themes-are-oklch /
// warmth-lives-in-tokens): pills on the accent-subtle ground, stamps in muted
// ink, related links in the accent text — no new color.

import type { ReactElement } from "react";

import { useViewStore } from "../../stores/view/viewStore";

/** The parsed frontmatter fields the header renders. */
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

/** Open a related document in the markdown reader (and focus its node) — the same
 *  navigation intent the trees and the in-body wiki-links use. */
function openRelated(stem: string): void {
  const id = `doc:${stem}`;
  useViewStore.getState().select(id);
  useViewStore.getState().openInViewer(id, "markdown");
}

/**
 * Render the frontmatter as structured chrome. Tags become pills, the dates
 * become stamps, and each related entry becomes a clickable wiki-link that opens
 * the target document in the reader. Renders nothing when there is no
 * frontmatter (general markdown).
 */
export function FrontmatterHeader({
  frontmatter,
}: {
  frontmatter: Frontmatter | null;
}): ReactElement | null {
  if (!frontmatter) return null;
  const { tags, date, modified, related } = frontmatter;
  const hasContent =
    tags.length > 0 ||
    related.length > 0 ||
    date !== undefined ||
    modified !== undefined;
  if (!hasContent) return null;

  return (
    <header className="mb-vs-3 space-y-vs-2 border-b border-rule pb-vs-2">
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-vs-1" aria-label="tags">
          {tags.map((tag) => (
            <li
              key={tag}
              className="rounded-vs-sm bg-accent-subtle px-vs-1 py-vs-0-5 text-label text-accent-text"
            >
              #{tag}
            </li>
          ))}
        </ul>
      )}
      {(date !== undefined || modified !== undefined) && (
        <dl className="flex flex-wrap gap-vs-3 text-label text-ink-muted">
          {date !== undefined && (
            <div className="flex gap-vs-1">
              <dt className="text-ink-faint">created</dt>
              <dd className="font-medium text-ink">{date}</dd>
            </div>
          )}
          {modified !== undefined && (
            <div className="flex gap-vs-1">
              <dt className="text-ink-faint">modified</dt>
              <dd className="font-medium text-ink">{modified}</dd>
            </div>
          )}
        </dl>
      )}
      {related.length > 0 && (
        <div className="space-y-vs-0-5">
          <span className="text-label text-ink-faint">related</span>
          <ul className="flex flex-wrap gap-vs-2">
            {related.map((stem) => (
              <li key={stem}>
                <button
                  type="button"
                  onClick={() => openRelated(stem)}
                  className="text-label text-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                >
                  {stem}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
