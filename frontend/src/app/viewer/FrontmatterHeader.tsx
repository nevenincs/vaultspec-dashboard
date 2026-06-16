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

import { type Frontmatter } from "../../stores/server/parseDocument";
import { useViewStore } from "../../stores/view/viewStore";

// `parseDocument` and its `Frontmatter`/`ParsedDocument` types now live in the
// stores layer (the model); this header is one view of that model. The reader
// imports the parser from the stores module directly (dashboard-layer-ownership:
// a view never owns the parsing the stores layer also consumes).

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
    <header className="mb-fg-3 space-y-fg-2 border-b border-rule pb-fg-2">
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-fg-1" aria-label="tags">
          {tags.map((tag) => (
            <li
              key={tag}
              className="rounded-fg-xs bg-accent-subtle px-fg-1 py-fg-0-5 text-label text-accent-text"
            >
              #{tag}
            </li>
          ))}
        </ul>
      )}
      {(date !== undefined || modified !== undefined) && (
        <dl className="flex flex-wrap gap-fg-3 text-label text-ink-muted">
          {date !== undefined && (
            <div className="flex gap-fg-1">
              <dt className="text-ink-faint">created</dt>
              <dd className="font-medium text-ink">{date}</dd>
            </div>
          )}
          {modified !== undefined && (
            <div className="flex gap-fg-1">
              <dt className="text-ink-faint">modified</dt>
              <dd className="font-medium text-ink">{modified}</dd>
            </div>
          )}
        </dl>
      )}
      {related.length > 0 && (
        <div className="space-y-fg-0-5">
          <span className="text-label text-ink-faint">related</span>
          <ul className="flex flex-wrap gap-fg-2">
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
