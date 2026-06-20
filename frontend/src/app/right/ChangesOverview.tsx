// Changes tab (figma-frontend-rewrite W02.P05; binding ActivityRail Changes state,
// Figma node 244:751). The board's Changes pane is a compact working-tree summary
// over TWO flat lists: a "<N> files · <M> documents +A −D" summary line, then
// "CHANGED FILES — open diff or source" (each row a status dot + mono basename +
// numstat +adds/−dels + an open arrow), then "CHANGED DOCUMENTS — open reader"
// (each row a category dot + readable title + an open arrow). A file row opens its
// source in the code viewer; a document row opens the markdown reader — both
// through the preserved `openInViewer` intent, never a new fetch.
//
// Data is the stores layer's read-only `/ops/git` projection (chrome reads
// selectors, never the engine, never the raw `tiers` block — dashboard-layer-
// ownership): `useChangedFiles` is the status-parsed per-file list (with the
// `vault` flag that splits files vs documents and the numstat tallies);
// `useGitStatus` supplies the loading / degraded / errored truth. The surface
// NEVER writes git (engine-read-and-infer): it observes and opens, never stages,
// commits, or discards.
//
// DIFF LEGIBILITY: the numstat tallies keep the sacred diff hues AND carry +/−
// glyphs + programmatic labels, so the change magnitude reads in grayscale.

import {
  useActiveScope,
  useChangesOverview,
  type ChangedDocumentRow,
  type ChangedSourceFileRow,
} from "../../stores/server/queries";
import { openDocTab } from "../../stores/view/tabs";
import { SectionLabel, StatusDot } from "../kit";

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
// The Changes tab
// ---------------------------------------------------------------------------

export function ChangesOverview() {
  const scope = useActiveScope();
  const changes = useChangesOverview(scope);

  if (changes.noScope) {
    return <p className={changes.noScopeClassName}>{changes.noScopeLabel}</p>;
  }

  return (
    <div className={changes.rootClassName} data-changes-overview>
      {/* Summary line (board 244:751): "<N> files · <M> documents +A −D". */}
      {changes.hasChanges && (
        <p className={changes.summaryClassName} data-changes-summary>
          <span className={changes.summaryPrimaryClassName}>
            {changes.summaryLabels.files}
          </span>
          <span className={changes.summaryDividerClassName}>·</span>
          <span className={changes.summaryPrimaryClassName}>
            {changes.summaryLabels.documents}
          </span>
          <span className={changes.summaryAdditionsClassName} data-tabular>
            {changes.summaryLabels.additions}
          </span>
          <span className={changes.summaryDeletionsClassName} data-tabular>
            {changes.summaryLabels.deletions}
          </span>
        </p>
      )}

      {/* Loading / degraded / error states (read from the stores git seam). */}
      {changes.loading && (
        <p className={changes.loadingClassName} data-changes-loading role="status">
          {changes.loadingLabel}
        </p>
      )}
      {changes.degraded && (
        <p className={changes.degradedClassName} data-git-degraded>
          {changes.degradedLabel}
        </p>
      )}
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
          <ul className={changes.listClassName} aria-label={changes.filesListAriaLabel}>
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
  );
}
