// The document panel's identity block. The panel's own tab already carries the
// document title, so the reader chrome no longer repeats it as a Vault / <type> /
// <title> breadcrumb (owner review, 2026-08-01): it states the identity ONCE — the
// doc-type mark, the title, and the type/feature pills — over a small second line
// giving the repo-relative path.
//
// Dumb chrome: every value arrives resolved from the stores header projection
// (`deriveMarkdownHeaderView`), which is where the doc type, feature tags, and path
// are derived (dashboard-layer-ownership). Presentation only — the doc-type mark is
// the SAME centralized `docMark` the vault tree rows use, and both pills are kit
// `Chip` instances, never a hand-built pill.

import { authoredDisplayText } from "../../platform/localization/displayText";
import { DOC_MARK_PX, docMark } from "../left/vaultRowPresentation";
import { Chip } from "../kit";
import type { Category } from "../kit";

export interface DocHeadingView {
  /** The document title (the tab's own title). */
  title: string;
  /** The raw doc type (`adr`, `plan`, …) selecting the centralized mark. */
  docType: string | null;
  /** The localized doc-type label, or null when the type is not a displayable
   *  vault identity (an `index` metanode has no category anywhere). */
  typeLabel: string | null;
  /** The bound category for the type pill's dot, when the type has one. */
  category: Category | null;
  /** The document's feature tags, served on the node. */
  featureTags: string[];
  /** The repo-relative path, or null when the engine served none. */
  path: string | null;
}

export function DocHeading({ heading }: { heading: DocHeadingView }) {
  const Mark = docMark(heading.docType ?? "");
  const title = authoredDisplayText(heading.title);
  const path = heading.path === null ? null : authoredDisplayText(heading.path);
  return (
    <div className="flex min-w-0 flex-col gap-fg-0-5" data-doc-heading>
      <div className="flex min-w-0 items-center gap-fg-2">
        <Mark size={DOC_MARK_PX} aria-hidden className="shrink-0 text-ink-muted" />
        <h2
          className="min-w-0 truncate text-body-strong text-ink"
          title={title}
          data-doc-heading-title
        >
          {title}
        </h2>
        {heading.typeLabel !== null && heading.category !== null && (
          <Chip category={heading.category}>{heading.typeLabel}</Chip>
        )}
        {heading.featureTags.map((tag) => (
          <Chip key={tag} category="feature">
            {authoredDisplayText(`#${tag}`)}
          </Chip>
        ))}
      </div>
      {path !== null && (
        <span
          className="min-w-0 truncate font-mono text-meta text-ink-faint"
          title={path}
          data-doc-heading-path
        >
          {path}
        </span>
      )}
    </div>
  );
}
