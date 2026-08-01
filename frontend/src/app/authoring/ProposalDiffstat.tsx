// The proposal card's diffstat (research C4; agent-panel-shell-integration D4c): an
// aggregate `+X −Y` with a per-file breakdown, so a reviewer sees the SHAPE of a
// change before deciding, without the card turning into a diff.
//
// Where the numbers come from, stated plainly: the engine deliberately serves NO
// diff — `wireTypes.ts` says so ("hunking is client-rendered presentation; a diff is
// a derived review artifact, never authority"). The bounded LIST projection the card
// renders from carries `operation_count` and nothing finer. So the stat is computed
// from the DETAIL route's served base/proposed texts through the SAME `diffLines` /
// `diffStat` pair the DiffPanel already hunks with — one diff implementation, no new
// wire, and no number invented here.
//
// Cost: this mounts the detail read per card. It is the identical query the diff
// expansion uses, so TanStack serves the expansion from cache afterwards rather than
// re-fetching — the read moved earlier, it did not double.
//
// SHAPE (the captured reference grammar). The card follows the outcome card the
// reference desktop agents render when a run finishes — read directly from
// `.tmp/ui-captures/chatgpt-composer.png` and `chatgpt-desktop.png`, which show the
// same card in two states. Its grammar is: a rounded bordered container; a
// rounded-square ICON TILE at the left; a bold title counting what changed; the
// aggregate `+X −Y` immediately beneath it; a rule; then one row per file where the
// DIRECTORY reads muted and the FILENAME reads dark, so a list of long paths still
// scans by the part that identifies the file.
//
// Two deliberate deviations from the captures, both because copying them exactly
// would make the card lie about this product:
//   - the reference puts the aggregate and the action in the SAME slot beneath the
//     title (one capture shows each), which reads as a hover swap. Ours shows the
//     aggregate always and puts the action terminal-right, so a reviewer never has
//     to hover to see the size of what they are approving.
//   - the reference action carries an arrow-up-right, meaning "opens elsewhere".
//     Ours expands the diff INLINE inside the card, so it carries a disclosure
//     chevron instead. The label follows the reference; the glyph follows the
//     behaviour.
//
// Layer ownership: dumb app chrome over `useProposalDetail`. No wire, no raw tiers.
// The CARD itself is wire-free and prop-driven so the review desk can render it.

import { useMemo, type ReactNode } from "react";
import { FileDiff } from "lucide-react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { authoredDisplayText } from "../../platform/localization/displayText";
import {
  useProposalDetail,
  type ReviewDocumentProjection,
} from "../../stores/server/authoring";
import { diffLines, diffStat } from "./diffLines";

const MSG = {
  aggregate: "documents:reviewStation.diffstat.aggregate",
  added: "documents:reviewStation.diffstat.added",
  removed: "documents:reviewStation.diffstat.removed",
  atLeast: "documents:reviewStation.diffstat.atLeast",
  floorMarker: "documents:reviewStation.diffstat.floorMarker",
} as const;

/** The card's title counts the files a run touched — the reference's "Edited N
 *  files". One review document is one file, so the count is the served list
 *  length and nothing is estimated. */
const EDITED_FILES_KEY = "documents:reviewStation.diffstat.editedFiles" as const;

/** Rendered size of the tile glyph, matching the reference's small mark inside a
 *  larger rounded tile. */
const TILE_GLYPH_REM = "1rem";

export interface FileDiffstat {
  label: string;
  added: number;
  removed: number;
  /** True when either served side was byte-capped, so the counts are a FLOOR. The
   *  card says so rather than presenting a truncated tally as exact. */
  truncated: boolean;
}

export interface ProposalDiffstatView {
  files: FileDiffstat[];
  added: number;
  removed: number;
  truncated: boolean;
}

/** A human label for a review document's target — its path/stem when the served ref
 *  carries one, else the child key. Presentation only; the ref is opaque. */
export function diffstatLabel(document: unknown, childKey: string): string {
  if (document && typeof document === "object") {
    const ref = document as { path?: unknown; stem?: unknown };
    if (typeof ref.path === "string" && ref.path) return ref.path;
    if (typeof ref.stem === "string" && ref.stem) return ref.stem;
  }
  return childKey;
}

/** A file label split into the part that LOCATES it and the part that NAMES it.
 *  The reference renders the directory muted and the filename dark, which is what
 *  makes a column of long paths scannable: the eye lands on the name. */
export interface SplitPath {
  /** Everything up to and including the final separator. Empty at the root. */
  directory: string;
  /** The final segment. Never empty for a non-empty label — a label that is all
   *  separators falls back to the whole label so a row is never nameless. */
  name: string;
}

/** Split a path label for rendering. Presentation only: the label is an opaque
 *  served string, so this never validates or normalizes it, and a label with no
 *  separator is all name (which is exactly right for a bare filename). */
export function splitPathLabel(label: string): SplitPath {
  const cut = label.lastIndexOf("/");
  if (cut < 0) return { directory: "", name: label };
  const name = label.slice(cut + 1);
  // A trailing separator leaves no name; keep the whole label rather than render
  // an empty cell.
  return name
    ? { directory: label.slice(0, cut + 1), name }
    : { directory: "", name: label };
}

/** Fold the served review documents into the aggregate + per-file stat. Pure so the
 *  tally rules — including truncation honesty — are driven directly by test. */
export function deriveProposalDiffstat(
  documents: readonly ReviewDocumentProjection[],
): ProposalDiffstatView {
  const files = documents.map((doc): FileDiffstat => {
    const stat = diffStat(diffLines(doc.base.text, doc.proposed.text));
    return {
      label: diffstatLabel(doc.document, doc.child_key),
      added: stat.added,
      removed: stat.removed,
      truncated: doc.base.truncated || doc.proposed.truncated,
    };
  });
  return {
    files,
    added: files.reduce((total, file) => total + file.added, 0),
    removed: files.reduce((total, file) => total + file.removed, 0),
    truncated: files.some((file) => file.truncated),
  };
}

/**
 * One `+X −Y` pair.
 *
 * When either served body was byte-capped the counts are a FLOOR, not a
 * measurement — and that has to be legible to a HUMAN deciding whether to approve,
 * not just present as a data attribute. So a truncated pair carries a visible
 * trailing marker AND a tooltip saying what the marker means; the attribute stays
 * for tests.
 */
function StatPair({
  added,
  removed,
  truncated,
}: {
  added: number;
  removed: number;
  truncated: boolean;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const addedLabel = resolveMessage({ key: MSG.added, values: { lines: added } });
  const removedLabel = resolveMessage({
    key: MSG.removed,
    values: { lines: removed },
  });
  const atLeast = resolveMessage({ key: MSG.atLeast });
  const floorMarker = resolveMessage({ key: MSG.floorMarker });
  if (addedLabel.usedFallback || removedLabel.usedFallback) return null;
  const floorTitle = truncated && !atLeast.usedFallback ? atLeast.message : undefined;
  return (
    <span
      className="flex shrink-0 items-center gap-fg-1 text-caption tabular-nums"
      data-diffstat-pair
      data-diffstat-truncated={truncated ? "" : undefined}
      title={floorTitle}
    >
      <span className="text-state-complete">{addedLabel.message}</span>
      <span className="text-state-broken">{removedLabel.message}</span>
      {floorTitle !== undefined && !floorMarker.usedFallback && (
        <span className="text-ink-faint" title={floorTitle} data-diffstat-floor>
          {floorMarker.message}
        </span>
      )}
    </span>
  );
}

export interface ProposalDiffstatCardProps {
  /** The folded stat, already derived. */
  view: ProposalDiffstatView;
  /** The terminal-right affordance that opens the change itself. Optional: the
   *  card is complete without one (it still states what changed), and a host with
   *  no diff to show should pass nothing rather than render a dead control. */
  action?: ReactNode;
}

/**
 * The outcome card: what a run PRODUCED, rendered as an object you can look at.
 *
 * Wire-free and prop-driven — every value arrives derived, so the review desk
 * mounts this directly and no harness affordance is needed on the container
 * (production-dev-separation).
 */
export function ProposalDiffstatCard({ view, action }: ProposalDiffstatCardProps) {
  const resolveMessage = useLocalizedMessageResolver();
  const title = resolveMessage({
    key: EDITED_FILES_KEY,
    values: { count: view.files.length },
  });
  if (view.files.length === 0 || title.usedFallback) return null;

  return (
    <div
      className="flex flex-col overflow-hidden rounded-fg-sm border border-rule bg-paper-raised"
      data-proposal-diffstat
    >
      <div className="flex items-start gap-fg-2 px-fg-2 py-fg-2">
        {/* The rounded-square tile: a quiet container that gives the card a
            fixed left edge, so a stack of these aligns down the page. */}
        <span
          aria-hidden
          className="flex shrink-0 items-center justify-center rounded-fg-sm bg-surface-sunken p-fg-1-5 text-ink-muted"
          data-diffstat-tile
        >
          <FileDiff size={TILE_GLYPH_REM} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-fg-0-5">
          <span className="truncate text-body font-medium text-ink" data-diffstat-title>
            {title.message}
          </span>
          <StatPair
            added={view.added}
            removed={view.removed}
            truncated={view.truncated}
          />
        </span>
        {action !== undefined && (
          <span className="shrink-0" data-diffstat-action>
            {action}
          </span>
        )}
      </div>
      <ul className="flex flex-col border-t border-rule">
        {view.files.map((file) => {
          const path = splitPathLabel(file.label);
          return (
            <li
              key={file.label}
              className="flex items-center justify-between gap-fg-2 px-fg-2 py-fg-1-5"
              data-diffstat-file={file.label}
            >
              {/* Directory muted, filename dark: the row is one string, so it
                  truncates as one, but the eye lands on the name. */}
              <span
                className="min-w-0 truncate font-mono text-caption"
                title={file.label}
              >
                {path.directory && (
                  <span className="text-ink-faint" data-diffstat-directory>
                    {authoredDisplayText(path.directory)}
                  </span>
                )}
                <span className="text-ink" data-diffstat-name>
                  {authoredDisplayText(path.name)}
                </span>
              </span>
              <StatPair
                added={file.added}
                removed={file.removed}
                truncated={file.truncated}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The container. Shows no STAT until the detail resolves — a proposal whose
 * bodies have not arrived has no honest tally, and a placeholder `+0 −0` would
 * read as "this changes nothing".
 *
 * The hosted ACTION is not conditional on that, though. It opens the diff, which
 * exists whether or not this tally has been computed yet, so when there is no
 * card to draw the action still renders on its own. Letting it disappear with the
 * stat was a real regression: a reviewer with a slow detail read lost the only
 * way to see what they were approving.
 */
export function ProposalDiffstat({
  changesetId,
  action,
}: {
  changesetId: string;
  action?: ReactNode;
}) {
  const detail = useProposalDetail(changesetId);
  const documents = detail.data?.review_documents;
  const view = useMemo(
    () => (documents === undefined ? null : deriveProposalDiffstat(documents)),
    [documents],
  );
  if (view === null || view.files.length === 0) {
    return action === undefined ? null : (
      <div className="flex justify-end" data-diffstat-action-only>
        {action}
      </div>
    );
  }
  return <ProposalDiffstatCard view={view} action={action} />;
}
