// The Changes fold — the working-tree summary, folded into the activity rail
// (binding redesign ActivityRail · Status, node 599:2099 → GitStatusPill 642:1724).
// The rail's three tabs (Status · Changes · Search) were retired: the Changes pane
// is now a COLLAPSIBLE at the top of the one status surface. Its header is the
// summary line itself — a twisty + the ONE aggregated "<N> files changed" count
// (vault documents are files too — no separate documents tally) with the sacred
// "+A −D" diff tallies right-aligned — and its body (revealed on expand) is the
// STATUS TREE the binding GitStatusPill (642:1745) renders: three collapsible
// groups — MODIFIED / DELETED / NEW — each a twisty + status eyebrow + count
// over filename + numstat rows. A row reads like a left-rail Files-tree row (the
// ONE file-row idiom): the Phosphor File mark in quiet ink + mono filename,
// indented one tree step under its group with the standard vertical indent guide
// under the group's twisty column. No per-row status dot, no open arrow; a
// deleted name is struck and shows only −D, a new name only +A.
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

import { File } from "@phosphor-icons/react";

import {
  useActiveScope,
  useChangesOverview,
  useChangesSummary,
  type ChangesSummaryView,
  type GitChangeGroupView,
  type GitChangeRow,
} from "../../stores/server/queries";
import {
  deriveStatusSectionChromeView,
  toggleStatusSection,
  useStatusSectionOpen,
} from "../../stores/view/statusTabChrome";
import { previewDocTab } from "../../stores/view/tabs";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { ButtonHTMLAttributes, Ref } from "react";

import {
  DecorativeGlyph,
  FoldSection,
  SectionLabel,
  Skeleton,
  SkeletonRow,
  StateBlock,
} from "../kit";

// The Changes fold defaults closed — the board's resting GitStatusPill state.
const CHANGES_SECTION_ID = "changes";
const CHANGES_DEFAULT_OPEN = false;

// The row's file mark: the SAME Phosphor File domain mark, at the same 14px
// gate size and quiet neutral ink, that the left rail's Files tree leads its
// file rows with (iconography ADR grayscale-by-shape).
const ROW_MARK_PX = 14;
// The group body's indent guide sits under the group header's twisty column:
// the header is px-fg-1 (0.25rem) padded and its twisty is 10px (0.625rem)
// wide, so the column center is 0.5625rem from the section edge — 0.3125rem
// inside the body's own px-fg-1 content box (rem only, no-hardcoded-px).
const GROUP_GUIDE_CENTER_REM = 0.3125;

// ---------------------------------------------------------------------------
// Change tree (binding GitStatusPill 642:1745): status groups + flat file rows
// ---------------------------------------------------------------------------

/** A changed-entry row: the left-rail file-row idiom (File mark + mono name) plus
 *  numstat — no status dot and no open arrow; the GROUP conveys the status, a
 *  deleted name is struck. A click opens the code viewer (source) or the
 *  markdown reader (vault doc). */
function ChangeRow({ row, scope }: { row: GitChangeRow; scope: unknown }) {
  const open = () => {
    // Read-mode open: preview in the single provisional tab (VS Code preview),
    // so browsing changed files never spawns ever-growing permanent tabs (#15).
    void previewDocTab(row.nodeId, row.surface, scope).catch(() => undefined);
  };
  return (
    <li>
      <button
        type="button"
        onClick={open}
        title={row.path}
        className={row.rowClassName}
      >
        <span className="shrink-0 text-ink-faint" aria-hidden>
          <File size={ROW_MARK_PX} />
        </span>
        <span className={`${row.labelClassName} select-text`}>{row.label}</span>
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
                  <DecorativeGlyph name="plus" />
                  {row.adds}
                </span>
              )}
              {row.showDels && (
                <span className={row.delsClassName} aria-label={row.delsLabel}>
                  <DecorativeGlyph name="minus" />
                  {row.dels}
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
 *  status eyebrow + count over its file rows. Reuses the centralized FoldSection
 *  over the shared status-section chrome — the SAME fold idiom the rail's other
 *  sections use (design-system-is-centralized). Defaults COLLAPSED so the parents
 *  read as a clean "▸ Modified / ▸ Deleted / ▸ New" tree (a large Deleted group does
 *  not flood the rail) — expand a parent to drill into its files; the open state
 *  persists in `statusTabChrome`. */
function ChangeGroup({ group, scope }: { group: GitChangeGroupView; scope: unknown }) {
  const sectionId = `changes:${group.id}`;
  const open = useStatusSectionOpen(sectionId, false);
  const chrome = deriveStatusSectionChromeView(sectionId, open);
  const resolveMessage = useLocalizedMessageResolver();
  return (
    <FoldSection
      open={open}
      onToggle={() => toggleStatusSection(sectionId, false)}
      bodyId={chrome.bodyId}
      twistyPx={chrome.twistyPx}
      headerClassName={chrome.headerClassName}
      bodyClassName={chrome.bodyClassName}
      label={
        <SectionLabel className="min-w-0 flex-1">
          {resolveMessage(group.label).message}
        </SectionLabel>
      }
      trailing={
        <span className="shrink-0 text-meta text-ink-faint" data-tabular>
          {group.count}
        </span>
      }
      data-change-group={group.id}
    >
      {/* The standard tree-view indent: rows step one level under their group
          header, with the vertical guide under the header's twisty column —
          the same guide idiom the left rail's trees draw (presentation only,
          never a layout shift). */}
      <div className="relative">
        <span
          aria-hidden
          data-tree-guide
          className="pointer-events-none absolute inset-y-0 w-px bg-rule"
          style={{ insetInlineStart: `${GROUP_GUIDE_CENTER_REM}rem` }}
        />
        <ul className="flex flex-col gap-fg-0-5 pl-fg-3">
          {group.rows.map((row) => (
            <ChangeRow key={row.path} row={row} scope={scope} />
          ))}
        </ul>
      </div>
    </FoldSection>
  );
}

// ---------------------------------------------------------------------------
// Fold header — the summary line itself (board GitStatusPill `git-head`).
// ---------------------------------------------------------------------------

/** The fold's label: the ONE aggregated "<N> files changed" count — falls back to
 *  the in-flight / degraded / errored / clean copy so the collapsed header always
 *  states the working-tree truth. Derived from the LIGHT engine summary, never
 *  the full changed-files lists (changes-summary-projection). */
function changesHeadLabel(changes: ChangesSummaryView): string {
  if (changes.loading) return changes.loadingLabel;
  if (changes.degraded) return changes.degradedLabel;
  if (changes.errored) return changes.errorTitle;
  if (changes.hasChanges) return changes.summaryLabels.total;
  return changes.cleanLabel;
}

// ---------------------------------------------------------------------------
// The Changes fold BODY — the heavy per-file status tree.
// ---------------------------------------------------------------------------

/** The expanded body: the full MODIFIED / DELETED / NEW status tree plus its
 *  own loading / degraded / errored / clean states. It calls `useChangesOverview`
 *  (the full porcelain status + numstat read), so it is deliberately its OWN
 *  component rendered INSIDE the FoldSection body — the fold mounts children only
 *  while open (data-loading: mount-gated fetches), so a COLLAPSED Changes fold
 *  fetches none of this heavy text and reads only the light header summary. */
function ChangesOverviewBody({ scope }: { scope: unknown }) {
  const changes = useChangesOverview(scope);
  return (
    <div className={changes.rootClassName}>
      {/* LOADING — UI-only skeleton mimicking the change rows (state-mode-uniformity
          ADR D2): no visible "reading…" copy, the label is screen-reader-only. */}
      {changes.loading && (
        <Skeleton label={changes.loadingLabel}>
          <SkeletonRow width="w-3/4" />
          <SkeletonRow width="w-2/3" />
        </Skeleton>
      )}

      {/* DEGRADED — the shared caution glyph + one plain sentence (ADR D3), as a
          compact inline notice over the partial content. */}
      {changes.degraded && (
        <StateBlock mode="degraded" layout="inline" message={changes.degradedLabel} />
      )}

      {/* Error state — the head shows the title; the body carries the retry. The
          shared degraded glyph + sentence stand in for the bare title text. */}
      {changes.errored && (
        <div className={changes.errorRootClassName} data-changes-error>
          <StateBlock mode="degraded" layout="inline" message={changes.errorTitle} />
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

      {/* Clean working tree — the shared empty state: neutral glyph + one plain
          sentence (state-mode-uniformity ADR D3). */}
      {changes.clean && (
        <div data-git-clean>
          <StateBlock mode="empty" message={changes.cleanLabel} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Changes fold
// ---------------------------------------------------------------------------

export function ChangesOverview({
  headerRef,
  headerProps,
}: {
  /** Roving-nav header wiring so the Changes fold joins the rail's one-tab-stop
   *  section-header zone (keyboard-navigation W04.P07.S21). */
  headerRef?: Ref<HTMLButtonElement>;
  headerProps?: ButtonHTMLAttributes<HTMLButtonElement>;
} = {}) {
  const scope = useActiveScope();
  // The collapsed header reads the LIGHT engine-served rollup, not the full
  // changed-files lists — a cold load renders "N files · M documents / +A −D"
  // from a few bytes instead of ~227 KB of raw git text (changes-summary-projection).
  const changes = useChangesSummary(scope);
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
  const label = (
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
      headerRef={headerRef}
      headerProps={headerProps}
      data-changes-overview
    >
      {/* Mounted only while the fold is open (FoldSection renders children on
          open), so the heavy status + numstat read never fires for a collapsed
          fold — the header above already carries the summary truth. */}
      <ChangesOverviewBody scope={scope} />
    </FoldSection>
  );
}
