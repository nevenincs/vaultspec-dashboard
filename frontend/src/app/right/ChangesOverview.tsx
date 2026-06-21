// The Changes fold — the working-tree summary, folded into the activity rail
// (binding redesign ActivityRail · Status, node 599:2099 → GitStatusPill 642:1724).
// The rail's three tabs (Status · Changes · Search) were retired: the Changes pane
// is now a COLLAPSIBLE at the top of the one status surface. Its header is the
// summary line itself — a twisty + "<N> files · <M> documents" with the sacred
// "+A −D" diff tallies right-aligned — and its body (revealed on expand) is the
// STATUS TREE the binding GitStatusPill (642:1745) renders: three collapsible
// groups — MODIFIED / DELETED / NEW — each a twisty + uppercase eyebrow + count
// over flat filename + numstat rows (GitFileRow 653:1864): no per-row status dot,
// no open arrow; a deleted name is struck and shows only −D, a new name only +A.
// A row opens the code viewer (source files) or the markdown reader (vault docs)
// through the preserved `openDocTab` intent, never a new fetch. The outer fold AND
// the status groups default COLLAPSED, so the body reads as a clean "▸ Modified /
// ▸ Deleted / ▸ New" tree (a large Deleted group never floods the rail) — expand a
// parent to drill into its files.
//
// Data is the stores layer's read-only `/ops/git` projection (chrome reads
// selectors, never the engine, never the raw `tiers` block — dashboard-layer-
// ownership): `useChangesOverview(scope)` carries the per-file lists (with the
// `vault` flag that splits files vs documents and the numstat tallies) plus the
// loading / degraded / errored / clean truth. The surface NEVER writes git
// (engine-read-and-infer): it observes and opens, never stages, commits, or
// discards.
//
// DIFF LEGIBILITY: the numstat tallies keep the sacred diff hues AND carry +/−
// glyphs + programmatic labels, so the change magnitude reads in grayscale.
//
// Design system (design-system-is-centralized): the fold resolves to the centralized
// `FoldSection` primitive over the shared status-section chrome seam — the SAME
// flush twisty + collapsible body the rail's other sections use — with the open
// state living in the `statusTabChrome` "changes" section so the surface owns no ad
// hoc state. No raw hex, no loose font-size, no per-surface card chrome.

import {
  useActiveScope,
  useChangesOverview,
  type ChangesOverviewView,
  type GitChangeGroupView,
  type GitChangeRow,
} from "../../stores/server/queries";
import {
  deriveStatusSectionChromeView,
  toggleStatusSection,
  useStatusSectionOpen,
} from "../../stores/view/statusTabChrome";
import { openDocTab } from "../../stores/view/tabs";
import { FoldSection, SectionLabel } from "../kit";

// The Changes fold defaults closed — the board's resting GitStatusPill state.
const CHANGES_SECTION_ID = "changes";
const CHANGES_DEFAULT_OPEN = false;

// ---------------------------------------------------------------------------
// Change tree (binding GitStatusPill 642:1745): status groups + flat file rows
// ---------------------------------------------------------------------------

/** A changed-entry row (binding GitFileRow 653:1864): filename + numstat, no status
 *  dot and no open arrow — the GROUP conveys the status, a deleted name is struck.
 *  A click opens the code viewer (source) or the markdown reader (vault doc). */
function ChangeRow({ row, scope }: { row: GitChangeRow; scope: unknown }) {
  const open = () => {
    void openDocTab(row.nodeId, row.surface, scope).catch(() => undefined);
  };
  return (
    <li>
      <button
        type="button"
        onClick={open}
        title={row.path}
        className={row.rowClassName}
      >
        <span className={row.labelClassName}>{row.label}</span>
        {row.dirLabel && (
          <span className={row.dirClassName} aria-hidden>
            {row.dirLabel}
          </span>
        )}
        {row.showBinary ? (
          <span className={row.binaryClassName}>{row.binaryLabel}</span>
        ) : (
          (row.showAdds || row.showDels) && (
            <span className={row.diffClassName}>
              {row.showAdds && (
                <span className={row.addsClassName} aria-label={row.addsLabel}>
                  +{row.adds}
                </span>
              )}
              {row.showDels && (
                <span className={row.delsClassName} aria-label={row.delsLabel}>
                  −{row.dels}
                </span>
              )}
            </span>
          )
        )}
      </button>
    </li>
  );
}

/** A collapsible status group (binding GitStatusPill `Section` 655:2031): a twisty +
 *  uppercase eyebrow + count over its file rows. Reuses the centralized FoldSection
 *  over the shared status-section chrome — the SAME fold idiom the rail's other
 *  sections use (design-system-is-centralized). Defaults COLLAPSED so the parents
 *  read as a clean "▸ Modified / ▸ Deleted / ▸ New" tree (a large Deleted group does
 *  not flood the rail) — expand a parent to drill into its files; the open state
 *  persists in `statusTabChrome`. */
function ChangeGroup({ group, scope }: { group: GitChangeGroupView; scope: unknown }) {
  const sectionId = `changes:${group.id}`;
  const open = useStatusSectionOpen(sectionId, false);
  const chrome = deriveStatusSectionChromeView(sectionId, open);
  return (
    <FoldSection
      open={open}
      onToggle={() => toggleStatusSection(sectionId, false)}
      bodyId={chrome.bodyId}
      twistyPx={chrome.twistyPx}
      headerClassName={chrome.headerClassName}
      bodyClassName={chrome.bodyClassName}
      label={<SectionLabel className="min-w-0 flex-1">{group.label}</SectionLabel>}
      trailing={
        <span className="shrink-0 text-meta text-ink-faint" data-tabular>
          {group.count}
        </span>
      }
      data-change-group={group.id}
    >
      <ul className="flex flex-col gap-fg-0-5" aria-label={group.ariaLabel}>
        {group.rows.map((row) => (
          <ChangeRow key={row.path} row={row} scope={scope} />
        ))}
      </ul>
    </FoldSection>
  );
}

// ---------------------------------------------------------------------------
// Fold header — the summary line itself (board GitStatusPill `git-head`).
// ---------------------------------------------------------------------------

/** The fold's label: "<N> files · <M> documents" — falls back to the in-flight /
 *  degraded / errored / clean copy so the collapsed header always states the
 *  working-tree truth. */
function changesHeadLabel(changes: ChangesOverviewView): string {
  if (changes.loading) return changes.loadingLabel;
  if (changes.degraded) return changes.degradedLabel;
  if (changes.errored) return changes.errorTitle;
  if (changes.hasChanges)
    return `${changes.summaryLabels.files} · ${changes.summaryLabels.documents}`;
  return changes.cleanLabel;
}

// ---------------------------------------------------------------------------
// The Changes fold
// ---------------------------------------------------------------------------

export function ChangesOverview() {
  const scope = useActiveScope();
  const changes = useChangesOverview(scope);
  const open = useStatusSectionOpen(CHANGES_SECTION_ID, CHANGES_DEFAULT_OPEN);
  const chrome = deriveStatusSectionChromeView(CHANGES_SECTION_ID, open);

  if (changes.noScope) {
    return <p className={changes.noScopeClassName}>{changes.noScopeLabel}</p>;
  }

  // The right-aligned diff tallies stay with the summary header (sacred hues +
  // +/− glyphs), so the change magnitude reads even while the body is collapsed.
  const trailing = changes.hasChanges ? (
    // Binding GitStatusPill `git-head` (642:1720): "+A" then "−D" separated only
    // by the row gap — no divider dot between the sacred diff tallies.
    <span className="flex shrink-0 items-center gap-fg-1-5" data-changes-summary>
      <span className={changes.summaryAdditionsClassName} data-tabular>
        {changes.summaryLabels.additions}
      </span>
      <span className={changes.summaryDeletionsClassName} data-tabular>
        {changes.summaryLabels.deletions}
      </span>
    </span>
  ) : undefined;
  const label = changes.hasChanges ? (
    <span className={changes.summaryClassName}>
      <span className={changes.summaryPrimaryClassName}>
        {changes.summaryLabels.files}
      </span>
      <span className={changes.summaryDividerClassName} aria-hidden>
        ·
      </span>
      <span className={changes.summaryPrimaryClassName}>
        {changes.summaryLabels.documents}
      </span>
    </span>
  ) : (
    <span className={changes.summaryPrimaryClassName}>{changesHeadLabel(changes)}</span>
  );

  return (
    <FoldSection
      open={open}
      onToggle={() => toggleStatusSection(CHANGES_SECTION_ID, CHANGES_DEFAULT_OPEN)}
      bodyId={chrome.bodyId}
      twistyPx={chrome.twistyPx}
      headerClassName={chrome.headerClassName}
      bodyClassName={chrome.bodyClassName}
      label={label}
      trailing={trailing}
      data-changes-overview
    >
      <div className={changes.rootClassName}>
        {changes.loading && (
          <p className={changes.loadingClassName} data-changes-loading>
            {changes.loadingLabel}
          </p>
        )}

        {changes.degraded && (
          <p className={changes.degradedClassName} data-changes-degraded>
            {changes.degradedLabel}
          </p>
        )}

        {/* Error state — the head shows the title; the body carries the retry. */}
        {changes.errored && (
          <div className={changes.errorRootClassName} data-changes-error>
            <p className={changes.errorTitleClassName}>{changes.errorTitle}</p>
            <button
              type="button"
              onClick={changes.retry}
              className={changes.retryButtonClassName}
            >
              {changes.retryLabel}
            </button>
          </div>
        )}

        {/* The status tree — MODIFIED / DELETED / NEW collapsible groups, each over
            its filename + numstat rows (binding GitStatusPill expanded state). */}
        {changes.changeGroups.length > 0 && (
          <div className="flex flex-col gap-fg-2" data-change-groups>
            {changes.changeGroups.map((group) => (
              <ChangeGroup key={group.id} group={group} scope={scope} />
            ))}
          </div>
        )}

        {/* Clean working tree — an approachable copy-toned empty state. */}
        {changes.clean && (
          <p className={changes.cleanClassName} data-git-clean>
            {changes.cleanLabel}
          </p>
        )}
      </div>
    </FoldSection>
  );
}
