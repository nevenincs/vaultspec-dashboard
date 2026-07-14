// The feature-group panel (feature-group-authoring ADR D1/D3/D4/D5): the former
// flat "New document" modal, rebuilt as a two-stage feature-first flow. Stage 1
// selects-or-creates a feature and shows the group's pipeline coverage; stage 2
// adds ONE eligible document to it with deterministically pre-filled, editable
// cross-links. Dumb `app/` chrome (dashboard-layer-ownership): it drives the
// stores create mutation (the sole wire client), reads its draft through the
// chrome view seam, reads served coverage through `useFeatureCoverageView`, and
// opens the created doc through the tab seam when its identity is known — it never
// touches the engine client, raw view store, raw `tiers`, or identity parsing.
// Reachable from the vault-tree context menu, the Features-section affordance, the
// command palette, and the keymap under the one shared `left-rail:new-document`
// id, mounted once per shell branch beside the other app-wide dialogs.
//
// Eligibility and the newest link-target stems are ENGINE-SERVED (ADR D3): this
// panel only READS the served coverage through the pure store helpers, never
// recomputing the hierarchy gate. Creation affordances render ONLY from
// `deriveOfferedCreateDocTypes` (never `coverage.missing`, which honestly carries
// `exec` — a plan-derived scaffold that left the free-form panel, ADR D4), submit
// is gated on `isCreateDocTypeEligible` (the store deliberately does not self-gate,
// ADR D3), and a degraded read renders its honest state rather than an
// empty-pipeline claim.

import { useEffect, useMemo, useRef } from "react";
import { ArrowLeft, X } from "lucide-react";

import {
  useActiveScope,
  useCreateDoc,
  useEditorLinkingCorpus,
  useFeatureCoverageView,
} from "../../stores/server/queries";
import type { FeatureTypeCoverage } from "../../stores/server/engine";
import {
  consumeCreateDocFocusFeature,
  type CreateDocType,
  deriveCreateDocSubmission,
  deriveOfferedCreateDocTypes,
  goToCreateDocDocumentStage,
  goToCreateDocFeatureStage,
  isCreateDocTypeEligible,
  reconcileCreateDocType,
  resetCreateDocChrome,
  seedRelatedFromCoverage,
  setCreateDocError,
  setCreateDocFeature,
  setCreateDocRelated,
  setCreateDocTitle,
  setCreateDocType,
  useCreateDocChrome,
  useCreateDocChromeStore,
} from "../../stores/view/createDocChrome";
import { openDocTab } from "../../stores/view/tabs";
import { AutocompleteCombobox, type ComboOption } from "../viewer/AutocompleteCombobox";
import { Dialog } from "../chrome/Dialog";
import { Button } from "../kit";
import { DocTypeMark } from "../../scene/field/markComponents";

// The doc-type glyph reads one step down from the reader ink at a compact list
// density; bridged as a numeric icon size (the established icon idiom, like the
// tree's `DocTypeMark`/Lucide sizes — the px scanner reads style/class values, not
// numeric icon props).
const DOC_GLYPH_SIZE = 15;

// Plain-language SINGULAR labels for a creation act ("Add a Decision record"),
// distinct from the rail's plural GROUP headers ("Decisions"). Design-system law:
// never render a `doc_type` token raw.
const CREATE_DOC_TYPE_LABEL: Record<CreateDocType, string> = {
  research: "Research",
  reference: "Reference",
  adr: "Decision record",
  plan: "Plan",
  audit: "Audit",
};

// The coverage card iterates the FULL served pipeline (including `exec`, which the
// read-only card honestly shows even though it is never a creation affordance),
// so it carries its own complete label map.
const COVERAGE_TYPE_LABEL: Record<string, string> = {
  research: "Research",
  reference: "Reference",
  adr: "Decision record",
  plan: "Plan",
  exec: "Step record",
  audit: "Audit",
};

// The advisory purpose line an ELIGIBLE type row reads (its pipeline role in plain
// language). An INELIGIBLE row overrides this with its served-note reason below.
const CREATE_DOC_TYPE_HINT: Record<CreateDocType, string> = {
  research: "Explores the problem space",
  reference: "Grounds the work in existing code",
  adr: "Records the decision to make",
  plan: "Structures the implementation",
  audit: "Reviews delivered work, or opens a pipeline",
};

/** Map a served eligibility `note` token to plain language (ADR D3/D6): the
 *  ineligible types state their prerequisite; the eligible advisory note (audit's
 *  `no-upstream`) reads as its purpose. Never render the token raw. */
function typeRowHint(row: {
  docType: CreateDocType;
  eligible: boolean;
  note: string | undefined;
}): string {
  if (!row.eligible) {
    switch (row.note) {
      case "requires-research-or-reference":
        return "Needs a research or reference document first";
      case "requires-adr":
        return "Needs a decision record first";
      default:
        return "Not available yet in this feature's pipeline";
    }
  }
  return CREATE_DOC_TYPE_HINT[row.docType];
}

function coverageTypeLabel(docType: string): string {
  return COVERAGE_TYPE_LABEL[docType] ?? docType;
}

export function CreateDocDialog() {
  const scope = useActiveScope();
  const create = useCreateDoc();
  const { open, stage, docType, feature, title, related, error } = useCreateDocChrome();

  // Served per-feature pipeline coverage (ADR D2): the read is disabled until a
  // feature is chosen, so an empty feature reads as `coverage === undefined`.
  // Degradation is read from the view (from tiers), never guessed.
  const coverageView = useFeatureCoverageView(scope, feature);
  const coverage = coverageView.coverage;

  // The pickable feature vocabulary — the SAME live corpus the editor's Feature
  // picker reads, so both create entry points share one source and a value can only
  // ever name an existing tag (free text still creates a new one). Derived in a
  // memo over the raw corpus (store-selector law).
  const corpus = useEditorLinkingCorpus(scope);
  const featureOptions: ComboOption[] = useMemo(
    () => corpus.featureTags.map((tag) => ({ value: tag, primary: tag })),
    [corpus.featureTags],
  );
  const featureFieldRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Honour the one-shot focus request from the Features-section create affordance
  // (D5/D6): move focus to the feature combobox when the dialog opens with the flag
  // set. Consumed once so a later ordinary open does not steal focus.
  useEffect(() => {
    if (!open) return;
    if (!consumeCreateDocFocusFeature()) return;
    featureFieldRef.current
      ?.querySelector<HTMLInputElement>('[role="combobox"]')
      ?.focus();
  }, [open, feature]);

  // Reconcile the selected type against served eligibility (ADR D3): when coverage
  // arrives or changes, a selection that turned ineligible resets honestly to the
  // advised next step / first eligible. Reads the served flag, never recomputes it.
  useEffect(() => {
    if (!open) return;
    const reconciled = reconcileCreateDocType(docType, coverage);
    if (reconciled !== docType) setCreateDocType(reconciled);
  }, [open, coverage, docType]);

  // Seed the editable cross-link pre-fill (ADR D5) on a TYPE or FEATURE change only,
  // never on a bare coverage refresh — so a user-edited related list is never
  // clobbered when the watcher re-ingests. The feature -> coverage -> reconciled-type
  // chain re-seeds with the freshly-served stems once they land.
  const seedKeyRef = useRef<string>("");
  useEffect(() => {
    if (!open) {
      seedKeyRef.current = "";
      return;
    }
    const key = `${feature}::${docType}`;
    if (key === seedKeyRef.current) return;
    seedKeyRef.current = key;
    setCreateDocRelated(seedRelatedFromCoverage(docType, coverage));
  }, [open, feature, docType, coverage]);

  const offered = useMemo(() => deriveOfferedCreateDocTypes(coverage), [coverage]);
  const selectedEligible = isCreateDocTypeEligible(docType, coverage);

  const featureTrimmed = feature.trim();

  const handleContinue = () => {
    const draft = useCreateDocChromeStore.getState();
    if (draft.feature.trim().length === 0) {
      setCreateDocError("Pick or type a feature to continue");
      return;
    }
    goToCreateDocDocumentStage();
  };

  const submit = () => {
    // Read the freshest draft from the store, not the render snapshot: a combobox
    // free-text commit fires synchronously just before an Enter-submit.
    const draft = useCreateDocChromeStore.getState();
    const submission = deriveCreateDocSubmission({
      docType: draft.docType,
      feature: draft.feature,
      title: draft.title,
      related: draft.related,
    });
    if (!submission.ok) {
      setCreateDocError(submission.error);
      return;
    }
    // Presentational gate (ADR D3): the submission derivation deliberately does not
    // self-gate on eligibility, so the panel refuses an ineligible type here (the
    // Create button is also disabled — this guards the Enter path).
    if (!isCreateDocTypeEligible(submission.docType, coverage)) {
      setCreateDocError(
        `${CREATE_DOC_TYPE_LABEL[submission.docType]} needs an upstream document first`,
      );
      return;
    }
    setCreateDocError(null);
    create.mutate(
      {
        scope,
        docType: submission.docType,
        feature: submission.feature,
        title: submission.title,
        related: submission.related,
      },
      {
        onSuccess: ({ result, nodeId }) => {
          // A `created` result IS success even on the rare `nodeId === null` (the
          // apply receipt echoes a server-resolved identity, fail-closed): the
          // document exists, so auto-open the tab only when the identity is known.
          if (result.kind === "created") {
            if (nodeId) void openDocTab(nodeId, "markdown", scope);
            resetCreateDocChrome();
            return;
          }
          // Surface the served refusal reason verbatim (ADR constraint): core's
          // same-day-duplicate message ("...already exists...") rides the refused
          // result's `errors`; showing it honestly beats a fragile reason-substring
          // match (the create mutation folds a path collision into a plain refusal
          // with no structural kind, so the served text is the honest signal).
          const reason =
            result.kind === "refused" && result.errors.length > 0
              ? result.errors[0]!
              : "Could not create the document — check the feature and title.";
          setCreateDocError(reason);
        },
        onError: () => setCreateDocError("Create failed"),
      },
    );
  };

  const submitOnEnter = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  };

  // Roving arrow-key selection across the ELIGIBLE type radios (Class-B
  // widget-intrinsic keys stay in-component, and the composite stopPropagations the
  // consumed keys so they never reach the global keymap dispatcher — actions-keymap-
  // palette law). Ineligible radios stay visible + perceivable but are skipped by
  // arrow traversal.
  const moveSelection = (dir: 1 | -1) => {
    const eligible = offered.filter((o) => o.eligible).map((o) => o.docType);
    if (eligible.length === 0) return;
    const index = eligible.indexOf(docType);
    const nextIndex =
      index < 0
        ? dir === 1
          ? 0
          : eligible.length - 1
        : (index + dir + eligible.length) % eligible.length;
    const next = eligible[nextIndex]!;
    setCreateDocType(next);
    optionRefs.current[next]?.focus();
  };

  const onRadiogroupKeyDown = (event: React.KeyboardEvent) => {
    // Bare Arrow{Up,Down,Left,Right} are GLOBAL keybindings (feature/neighbor
    // navigation); the radios are buttons so the dispatcher's text gate does not
    // suppress them, and the Dialog traps only Tab. Stop the consumed arrows here so
    // roving between type radios never also mutates the graph selection.
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      moveSelection(1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      moveSelection(-1);
    }
  };

  const removeRelated = (stem: string) => {
    setCreateDocRelated(related.filter((entry) => entry !== stem));
  };

  const isFeatureStage = stage === "feature";

  return (
    <Dialog
      open={open}
      onClose={resetCreateDocChrome}
      title={isFeatureStage ? "Add to a feature" : "Add a document"}
      description={
        isFeatureStage
          ? "Pick the feature this work belongs to, or type a new tag to start one. New documents join the feature's pipeline."
          : "Only documents the pipeline is ready for can be added. Links to the newest upstream documents are pre-filled."
      }
      footer={
        <div className="flex items-center justify-end gap-fg-2">
          <Button variant="secondary" onClick={resetCreateDocChrome}>
            Cancel
          </Button>
          {isFeatureStage ? (
            <Button
              variant="primary"
              onClick={handleContinue}
              disabled={featureTrimmed.length === 0}
            >
              Continue
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={submit}
              disabled={create.isPending || !selectedEligible}
            >
              Create
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-fg-3 px-fg-4 pt-fg-3 pb-fg-4">
        {isFeatureStage ? (
          <FeatureStage
            featureFieldRef={featureFieldRef}
            featureOptions={featureOptions}
            feature={feature}
            coverageView={coverageView}
            onContinue={handleContinue}
          />
        ) : (
          <DocumentStage
            feature={feature}
            offered={offered}
            selectedType={docType}
            optionRefs={optionRefs}
            onRadiogroupKeyDown={onRadiogroupKeyDown}
            title={title}
            related={related}
            onRemoveRelated={removeRelated}
            onTitleEnter={submitOnEnter}
          />
        )}

        {error !== null && (
          <p role="alert" className="text-label text-state-broken">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

// --- stage 1: select-or-create a feature + pipeline coverage ---------------------

interface FeatureStageProps {
  featureFieldRef: React.RefObject<HTMLDivElement | null>;
  featureOptions: ComboOption[];
  feature: string;
  coverageView: ReturnType<typeof useFeatureCoverageView>;
  onContinue: () => void;
}

function FeatureStage({
  featureFieldRef,
  featureOptions,
  feature,
  coverageView,
  onContinue,
}: FeatureStageProps) {
  return (
    <>
      {/* Corpus-fed feature picker (ADR D6): the SAME combobox the editor's Feature
          field uses, over the live feature-tag vocabulary. Free text is preserved, so
          typing a NEW tag still starts the feature with its first document. Enter with
          the list closed advances to the document stage. */}
      <div
        className="flex flex-col gap-fg-1 text-label text-ink-muted"
        ref={featureFieldRef}
        data-create-feature-field
      >
        Feature
        <AutocompleteCombobox
          options={featureOptions}
          onCommit={(value) => setCreateDocFeature(value)}
          onSubmit={onContinue}
          placeholder="feature-tag"
          ariaLabel="feature"
          allowFreeText
          initialQuery={feature}
          emptyLabel="Type to create a new feature tag"
        />
      </div>

      <CoverageCard feature={feature} coverageView={coverageView} />
    </>
  );
}

interface CoverageCardProps {
  feature: string;
  coverageView: ReturnType<typeof useFeatureCoverageView>;
}

export function CoverageCard({ feature, coverageView }: CoverageCardProps) {
  const { coverage, loading, degraded } = coverageView;
  const hasFeature = feature.trim().length > 0;
  const anyPresent = coverage?.types.some((entry) => entry.present) ?? false;

  return (
    <section
      aria-label="Pipeline coverage"
      className="flex flex-col gap-fg-2 rounded-fg-md border border-rule bg-paper-sunken p-fg-3"
    >
      <p className="text-meta font-medium uppercase tracking-wide text-ink-faint">
        In this feature
      </p>

      {!hasFeature ? (
        <p className="text-label text-ink-faint">
          Pick or type a feature above to see its pipeline.
        </p>
      ) : degraded ? (
        <p className="text-label text-ink-faint">
          Pipeline coverage is unavailable right now.
        </p>
      ) : loading && !coverage ? (
        <p className="text-label text-ink-faint">
          Checking this feature&rsquo;s pipeline&hellip;
        </p>
      ) : coverage && anyPresent ? (
        <ul className="flex flex-col gap-fg-1">
          {coverage.types.map((entry) => (
            <CoverageRow
              key={entry.doc_type}
              entry={entry}
              isNext={coverage.next_step === entry.doc_type}
            />
          ))}
        </ul>
      ) : (
        <p className="text-label text-ink-faint">
          No documents yet. A feature starts with a research or reference document
          &mdash; it exists once the first one is created.
        </p>
      )}
    </section>
  );
}

function CoverageRow({
  entry,
  isNext,
}: {
  entry: FeatureTypeCoverage;
  isNext: boolean;
}) {
  const label = coverageTypeLabel(entry.doc_type);
  return (
    <li
      className={`flex items-center gap-fg-2 rounded-fg-xs px-fg-1 py-fg-0-5 ${
        isNext && !entry.present ? "bg-accent-subtle" : ""
      }`}
    >
      <span className="shrink-0 text-ink-muted">
        <DocTypeMark kind={entry.doc_type} size={DOC_GLYPH_SIZE} />
      </span>
      <span className="shrink-0 text-label text-ink">{label}</span>
      {entry.present && entry.newest_stem && (
        <span className="min-w-0 flex-1 truncate text-meta text-ink-faint">
          {entry.newest_stem}
        </span>
      )}
      <span className="ml-auto shrink-0 pl-fg-2">
        {entry.present ? (
          <span className="text-meta font-medium text-state-active">Present</span>
        ) : isNext ? (
          <span className="rounded-fg-pill bg-accent-subtle px-fg-2 py-fg-0-5 text-meta font-medium text-accent-text">
            Next step
          </span>
        ) : (
          <span className="text-meta text-ink-faint">Not yet</span>
        )}
      </span>
    </li>
  );
}

// --- stage 2: add an eligible document with editable cross-links -----------------

interface DocumentStageProps {
  feature: string;
  offered: ReturnType<typeof deriveOfferedCreateDocTypes>;
  selectedType: CreateDocType;
  optionRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>;
  onRadiogroupKeyDown: (event: React.KeyboardEvent) => void;
  title: string;
  related: string[];
  onRemoveRelated: (stem: string) => void;
  onTitleEnter: (event: React.KeyboardEvent) => void;
}

function DocumentStage({
  feature,
  offered,
  selectedType,
  optionRefs,
  onRadiogroupKeyDown,
  title,
  related,
  onRemoveRelated,
  onTitleEnter,
}: DocumentStageProps) {
  return (
    <>
      {/* Sub-header: back to the feature stage + the selected feature pill. The
          Dialog header carries the title; this row carries navigation + context. */}
      <div className="flex items-center gap-fg-2">
        <button
          type="button"
          onClick={goToCreateDocFeatureStage}
          aria-label="Back to feature"
          className="inline-flex items-center gap-fg-1 rounded-fg-xs px-fg-1 py-fg-0-5 text-label text-ink-muted transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          Back
        </button>
        <span
          className="ml-auto inline-flex min-w-0 items-center rounded-fg-pill border border-rule bg-paper-sunken px-fg-2 py-fg-0-5 text-meta font-medium text-ink-muted"
          data-selected-feature
        >
          <span className="truncate">{feature}</span>
        </span>
      </div>

      <div className="flex flex-col gap-fg-1 text-label text-ink-muted">
        Document type
        <div
          role="radiogroup"
          aria-label="Document type"
          className="flex flex-col gap-fg-1"
          onKeyDown={onRadiogroupKeyDown}
        >
          {offered.map((row) => {
            const selected = row.docType === selectedType;
            const hint = typeRowHint(row);
            return (
              <button
                key={row.docType}
                ref={(node) => {
                  optionRefs.current[row.docType] = node;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={CREATE_DOC_TYPE_LABEL[row.docType]}
                disabled={!row.eligible}
                tabIndex={selected ? 0 : -1}
                onClick={() => setCreateDocType(row.docType)}
                className={`flex items-start gap-fg-2 rounded-fg-sm border px-fg-2 py-fg-2 text-left transition-colors duration-ui-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                  selected
                    ? "border-accent bg-accent-subtle"
                    : row.eligible
                      ? "border-rule bg-paper hover:bg-paper-sunken"
                      : "border-rule bg-paper opacity-50"
                }`}
              >
                <span className="mt-fg-0-5 shrink-0 text-ink-muted">
                  <DocTypeMark kind={row.docType} size={DOC_GLYPH_SIZE} />
                </span>
                <span className="flex min-w-0 flex-col gap-fg-0-5">
                  <span className="text-body text-ink">
                    {CREATE_DOC_TYPE_LABEL[row.docType]}
                  </span>
                  <span className="text-meta text-ink-faint">{hint}</span>
                </span>
                {selected && (
                  <span
                    aria-hidden
                    className="ml-auto shrink-0 text-meta font-medium text-accent-text"
                  >
                    Selected
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex flex-col gap-fg-1 text-label text-ink-muted">
        Title
        <input
          className="rounded-fg-xs border border-rule bg-paper px-fg-2 py-fg-1 text-body text-ink outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          value={title}
          onChange={(event) => setCreateDocTitle(event.target.value)}
          onKeyDown={onTitleEnter}
          placeholder="Document title"
          aria-label="title"
        />
      </label>

      {related.length > 0 && (
        <div className="flex flex-col gap-fg-1 text-label text-ink-muted">
          Linked documents
          <ul className="flex flex-wrap gap-fg-1" aria-label="Linked documents">
            {related.map((stem) => (
              <li key={stem}>
                <span className="inline-flex max-w-full items-center gap-fg-1 rounded-fg-pill border border-rule bg-paper-sunken px-fg-2 py-fg-0-5 text-meta text-ink-muted">
                  <span className="truncate">{stem}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveRelated(stem)}
                    aria-label={`Remove ${stem}`}
                    className="shrink-0 rounded-fg-xs text-ink-faint transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
