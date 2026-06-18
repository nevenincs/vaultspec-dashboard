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

import type { FrontmatterHeaderView } from "../../stores/server/queries";
import { openDocTab } from "../../stores/view/tabs";
import { Badge, Chip, Divider } from "../kit";

// `FrontmatterHeaderView` lives in the stores layer; this header renders it and
// owns click intent only.

/** Open a related document in the markdown reader (and focus its node) — the same
 *  navigation intent the trees and the in-body wiki-links use. */
function openRelated(nodeId: string, scope: string | null): void {
  void openDocTab(nodeId, "markdown", scope).catch(() => undefined);
}

/**
 * Render the frontmatter as structured chrome. Tags become kit pills, the dates
 * become meta stamps, and each related entry becomes a clickable wiki-link that
 * opens the target document in the reader. Renders nothing when there is no
 * frontmatter (general markdown).
 */
export function FrontmatterHeader({
  view,
  scope,
}: {
  view: FrontmatterHeaderView | null;
  scope: string | null;
}): ReactElement | null {
  if (!view) return null;

  return (
    <header className="mb-fg-6 space-y-fg-3">
      {view.tags.length > 0 && (
        <ul className="flex flex-wrap gap-fg-1-5" aria-label="tags">
          {view.tags.map((tag) => {
            return (
              <li key={tag.label}>
                {tag.category ? (
                  <Chip category={tag.category}>{tag.label}</Chip>
                ) : (
                  <Badge>{tag.label}</Badge>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {view.dates.length > 0 && (
        <dl className="reader-meta flex flex-wrap gap-fg-3 text-ink-muted">
          {view.dates.map((date) => (
            <div key={date.label} className="flex gap-fg-1">
              <dt className="text-ink-faint">{date.label}</dt>
              <dd className="font-medium text-ink" data-tabular>
                {date.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {view.related.length > 0 && (
        <div className="space-y-fg-1">
          <span className="reader-eyebrow text-ink-faint">related</span>
          <ul className="flex flex-wrap gap-fg-2">
            {view.related.map((related) => (
              <li key={related.nodeId}>
                <button
                  type="button"
                  onClick={() => openRelated(related.nodeId, scope)}
                  className="reader-meta text-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                >
                  {related.stem}
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
