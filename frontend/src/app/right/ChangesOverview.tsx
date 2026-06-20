// The Changes fold — the working-tree summary, folded into the activity rail
// (binding redesign ActivityRail · Status, node 599:2099 → GitStatusPill 642:1724).
// The rail's three tabs (Status · Changes · Search) were retired: the Changes pane
// is now a COLLAPSIBLE at the top of the one status surface. Its header is the
// summary line itself — a twisty + "<N> files · <M> documents" with the sacred
// "+A −D" diff tallies right-aligned — and its body (revealed on expand) is the
// two flat lists the pane always carried: "CHANGED FILES — open diff or source"
// (status dot + mono basename + numstat + open arrow → opens the code viewer) and
// "CHANGED DOCUMENTS — open reader" (category dot + readable title → opens the
// markdown reader). Both open through the preserved `openDocTab` intent, never a
// new fetch. The fold defaults COLLAPSED (the board's GitStatusPill resting state).
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
  type ChangedDocumentRow,
  type ChangedSourceFileRow,
  type ChangesOverviewView,
} from "../../stores/server/queries";
import {
  deriveStatusSectionChromeView,
  toggleStatusSection,
  useStatusSectionOpen,
} from "../../stores/view/statusTabChrome";
import { openDocTab } from "../../stores/view/tabs";
import { FoldSection, SectionLabel, StatusDot } from "../kit";

// The Changes fold defaults closed — the board's resting GitStatusPill state.
const CHANGES_SECTION_ID = "changes";
const CHANGES_DEFAULT_OPEN = false;

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

/** The board's open arrow (faint). */
function OpenArrow({ className }: { className: string }) {
  return (
    <span className={className} aria-hidden>
      →
    </span>
  );
}

/** A changed-FILE row: status dot + mono basename + numstat + open arrow. Opens
 *  the file's source in the code viewer (board "open diff or source"). */
function ChangedFileRow({
  file,
  scope,
}: {
  file: ChangedSourceFileRow;
  scope: unknown;
}) {
  const open = () => {
    void openDocTab(file.nodeId, "code", scope).catch(() => undefined);
  };
  return (
    <li>
      <button
        type="button"
        onClick={open}
        title={file.path}
        className={file.rowClassName}
      >
        <span
          aria-hidden
          className={file.dotClassName}
          style={{ backgroundColor: file.dotColor }}
        />
        <span className={file.basenameClassName}>{file.basename}</span>
        {file.adds !== null && (
          <span className={file.addsClassName} aria-label={file.addsLabel ?? undefined}>
            +{file.adds}
          </span>
        )}
        {file.dels !== null && (
          <span className={file.delsClassName} aria-label={file.delsLabel ?? undefined}>
            −{file.dels}
          </span>
        )}
        <OpenArrow className={file.openArrowClassName} />
      </button>
    </li>
  );
}

/** A changed-DOCUMENT row: category dot + readable title + open arrow. Opens the
 *  markdown reader (board "open reader"). */
function ChangedDocRow({ file, scope }: { file: ChangedDocumentRow; scope: unknown }) {
  const open = () => {
    void openDocTab(file.nodeId, "markdown", scope).catch(() => undefined);
  };
  return (
    <li>
      <button
        type="button"
        onClick={open}
        title={file.path}
        className={file.rowClassName}
      >
        {file.category ? (
          <StatusDot category={file.category} />
        ) : (
          <span aria-hidden className={file.fallbackDotClassName} />
        )}
        <span className={file.titleClassName}>{file.title}</span>
        <OpenArrow className={file.openArrowClassName} />
      </button>
    </li>
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

        {/* CHANGED FILES — open diff or source. */}
        {changes.hasFiles && (
          <section aria-label={changes.filesListAriaLabel} data-working-changes>
            <SectionLabel className={changes.sectionLabelClassName}>
              {changes.filesSectionLabel}
            </SectionLabel>
            <ul
              className={changes.listClassName}
              aria-label={changes.filesListAriaLabel}
            >
              {changes.files.map((file) => (
                <ChangedFileRow key={file.path} file={file} scope={scope} />
              ))}
            </ul>
          </section>
        )}

        {/* CHANGED DOCUMENTS — open reader. */}
        {changes.hasDocuments && (
          <section aria-label={changes.documentsListAriaLabel} data-changed-documents>
            <SectionLabel className={changes.sectionLabelClassName}>
              {changes.documentsSectionLabel}
            </SectionLabel>
            <ul
              className={changes.listClassName}
              aria-label={changes.documentsListAriaLabel}
            >
              {changes.documents.map((file) => (
                <ChangedDocRow key={file.path} file={file} scope={scope} />
              ))}
            </ul>
          </section>
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
