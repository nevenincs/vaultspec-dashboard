// The structured frontmatter header for the markdown reader (review-rail-viewers
// ADR P04.S18; re-skinned to the binding Reader boards in figma-frontend-rewrite
// W03.P10).
//
// A `.vault/` document leads with a YAML frontmatter block carrying `tags`,
// `date`, `modified`, and `related: ['[[wiki-link]]']`. The reader renders that
// block as STRUCTURED CHROME — tags as kit category pills, dates as meta stamps,
// related as clickable wiki-links — never as raw YAML text, which is what makes
// the reader vaultspec-aware rather than a generic markdown box. The vault
// frontmatter shape is fixed and simple, so a small focused parser handles it
// without adding a YAML dependency; an unrecognized or malformed block degrades
// to "no frontmatter" (the body still renders).
//
// It composes the centralized kit (design-system-is-centralized): tags become a
// `Chip` (when the tag names a known category, so its bound dot colour agrees with
// the graph node) or a neutral `Badge` (feature/other tags), and the header closes
// on a kit `Divider`. Labels read in the binding Reader/Eyebrow and Reader/Meta
// roles. All colour comes from the token tier (themes-are-oklch); no new colour.

import type { ReactElement } from "react";

import { type Frontmatter } from "../../stores/server/parseDocument";
import { useViewStore } from "../../stores/view/viewStore";
import { Badge, Chip, Divider } from "../kit";
import type { Category, CategoryToken } from "../kit";

// `parseDocument` and its `Frontmatter`/`ParsedDocument` types now live in the
// stores layer (the model); this header is one view of that model. The reader
// imports the parser from the stores module directly (dashboard-layer-ownership:
// a view never owns the parsing the stores layer also consumes).

/** The frontmatter tags that name a known kit category (directory + feature
 *  tags), so a chip's bound dot colour agrees with that category's graph node. */
const CATEGORY_TAGS: readonly CategoryToken[] = [
  "adr",
  "audit",
  "code",
  "exec",
  "feature",
  "index",
  "plan",
  "research",
];

/** Resolve a frontmatter tag to a kit category when it names one (so it renders
 *  as a colour-bound Chip); otherwise null (it renders as a neutral Badge). */
function tagCategory(tag: string): Category | null {
  return (CATEGORY_TAGS as readonly string[]).includes(tag)
    ? (tag as CategoryToken)
    : null;
}

/** Open a related document in the markdown reader (and focus its node) — the same
 *  navigation intent the trees and the in-body wiki-links use. */
function openRelated(stem: string): void {
  const id = `doc:${stem}`;
  useViewStore.getState().select(id);
  useViewStore.getState().openInViewer(id, "markdown");
}

/**
 * Render the frontmatter as structured chrome. Tags become kit pills, the dates
 * become meta stamps, and each related entry becomes a clickable wiki-link that
 * opens the target document in the reader. Renders nothing when there is no
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
    <header className="mb-fg-6 space-y-fg-3">
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-fg-1-5" aria-label="tags">
          {tags.map((tag) => {
            const category = tagCategory(tag);
            return (
              <li key={tag}>
                {category ? (
                  <Chip category={category}>#{tag}</Chip>
                ) : (
                  <Badge>#{tag}</Badge>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {(date !== undefined || modified !== undefined) && (
        <dl className="reader-meta flex flex-wrap gap-fg-3 text-ink-muted">
          {date !== undefined && (
            <div className="flex gap-fg-1">
              <dt className="text-ink-faint">created</dt>
              <dd className="font-medium text-ink" data-tabular>
                {date}
              </dd>
            </div>
          )}
          {modified !== undefined && (
            <div className="flex gap-fg-1">
              <dt className="text-ink-faint">modified</dt>
              <dd className="font-medium text-ink" data-tabular>
                {modified}
              </dd>
            </div>
          )}
        </dl>
      )}
      {related.length > 0 && (
        <div className="space-y-fg-1">
          <span className="reader-eyebrow text-ink-faint">related</span>
          <ul className="flex flex-wrap gap-fg-2">
            {related.map((stem) => (
              <li key={stem}>
                <button
                  type="button"
                  onClick={() => openRelated(stem)}
                  className="reader-meta text-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                >
                  {stem}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Divider className="mt-fg-3" />
    </header>
  );
}
