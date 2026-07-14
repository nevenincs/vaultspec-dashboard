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

import { useEffect, useId, useMemo, useRef } from "react";
import { ArrowLeft, X } from "lucide-react";

import {
  useActiveScope,
  useCreateDoc,
  useEditorLinkingCorpus,
  useFeatureCoverageView,
} from "../../stores/server/queries";
import type { FeatureTypeCoverage } from "../../stores/server/engine";
import {
  closeCreateDocDialog,
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
import { usePointerCoarse } from "../chrome/RowMenuDisclosure";
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
  const backRef = useRef<HTMLButtonElement>(null);

  const focusFeatureCombobox = () =>
    featureFieldRef.current
      ?.querySelector<HTMLInputElement>('[role="combobox"]')
      ?.focus();

  // Default initial focus (hardening audit default-initial-focus-is-close-button):
  // EVERY open lands on the stage's primary field — the feature combobox at stage 1
  // (the Features-affordance one-shot flag is consumed but no longer special: it now
  // matches the default), or the selected type radio on a draft-preserving reopen at
  // stage 2. Runs after the Dialog's own focus-first-focusable, so this wins.
  useEffect(() => {
    if (!open) return;
    consumeCreateDocFocusFeature();
    const draft = useCreateDocChromeStore.getState();
    if (draft.stage === "feature") {
      focusFeatureCombobox();
    } else {
      (optionRefs.current[draft.docType] ?? backRef.current)?.focus();
    }
    // Open-only by design: stage transitions are handled below.
  }, [open]);

  // Stage-keyed focus placement (audit focus-lost-on-stage-transition HIGH): the
  // activated Continue/Back unmounts with its stage, so focus is re-homed — to the
  // selected type radio entering stage 2, and to the feature combobox returning to
  // stage 1. A screen-reader user is never silently orphaned on document.body.
  const prevStageRef = useRef(stage);
  useEffect(() => {
    if (!open) {
      prevStageRef.current = stage;
      return;
    }
    if (prevStageRef.current === stage) return;
    prevStageRef.current = stage;
    if (stage === "document") {
      const draft = useCreateDocChromeStore.getState();
      (optionRefs.current[draft.docType] ?? backRef.current)?.focus();
    } else {
      focusFeatureCombobox();
    }
  }, [open, stage]);

  // Reconcile the selected type against served eligibility (ADR D3): when coverage
  // arrives or changes, a selection that turned ineligible resets honestly to the
  // advised next step / first eligible. Reads the served flag, never recomputes it.
  // When the radiogroup OWNS focus, focus follows the reconciled selection so the
  // roving tab stop and DOM focus never diverge (audit reconcile-moves-tabstop).
  useEffect(() => {
    if (!open) return;
    const reconciled = reconcileCreateDocType(docType, coverage);
    if (reconciled !== docType) {
      const groupOwnsFocus = Object.values(optionRefs.current).some(
        (node) => node !== null && node === document.activeElement,
      );
      setCreateDocType(reconciled);
      if (groupOwnsFocus) optionRefs.current[reconciled]?.focus();
    }
  }, [open, coverage, docType]);

  // Seed the editable cross-link pre-fill (ADR D5) on a TYPE or FEATURE change only,
  // never on a bare coverage refresh — so a user-edited related list is never
  // clobbered when the watcher re-ingests. The feature -> coverage -> reconciled-type
  // chain re-seeds with the freshly-served stems once they land.
  const seedKeyRef = useRef<string>("");
  useEffect(() => {
    if (!open) return;
    // The key survives a dismiss (draft preservation, hardening ADR): a reopen of
    // the SAME feature+type must NOT re-seed over preserved user edits. It clears
    // only on the successful-create reset below, so the next document seeds fresh.
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
            // The draft is gone: let the NEXT open re-seed even for the same
            // feature+type (the seed key otherwise survives dismissal).
            seedKeyRef.current = "";
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

  // Roving arrow-key traversal across ALL type radios — ineligible rows are
  // aria-disabled (focusable, inert) so keyboard and screen-reader users can REACH
  // them and hear their served reason (audit disabled-type-reason-unreachable HIGH);
  // arrows move focus through every row but selection only lands on an eligible one
  // (APG radio-with-disabled pattern). Class-B widget-intrinsic keys stay
  // in-component, and the composite stopPropagations the consumed keys so they never
  // reach the global keymap dispatcher (actions-keymap-palette law).
  const focusOfferedRow = (row: { docType: CreateDocType; eligible: boolean }) => {
    optionRefs.current[row.docType]?.focus();
    if (row.eligible) setCreateDocType(row.docType);
  };

  // The one-click path to the prerequisite (ADR D3's promised affordance,
  // hardening follow-on): activating an INELIGIBLE row walks the served reason
  // chain to the first eligible upstream type and selects+focuses it — plan's
  // gate is the decision record, whose own gate is research/reference.
  const activateOfferedRow = (row: {
    docType: CreateDocType;
    eligible: boolean;
    note: string | undefined;
  }) => {
    if (row.eligible) {
      setCreateDocType(row.docType);
      return;
    }
    let target: CreateDocType = row.note === "requires-adr" ? "adr" : "research";
    for (let hops = 0; hops < 3; hops += 1) {
      const next = offered.find((o) => o.docType === target);
      if (!next) return;
      if (next.eligible) {
        focusOfferedRow(next);
        return;
      }
      target = next.note === "requires-adr" ? "adr" : "research";
    }
  };

  const addRelated = (stem: string) => {
    // The store normalization dedupes and caps the list (CREATE_DOC_RELATED_MAX).
    setCreateDocRelated([...related, stem]);
  };

  const moveSelection = (dir: 1 | -1) => {
    if (offered.length === 0) return;
    const focusedIndex = offered.findIndex(
      (o) => optionRefs.current[o.docType] === document.activeElement,
    );
    const currentIndex =
      focusedIndex >= 0
        ? focusedIndex
        : offered.findIndex((o) => o.docType === docType);
    const base = currentIndex < 0 ? (dir === 1 ? -1 : 0) : currentIndex;
    const next = offered[(base + dir + offered.length) % offered.length]!;
    focusOfferedRow(next);
  };

  const onRadiogroupKeyDown = (event: React.KeyboardEvent) => {
    // Bare Arrow{Up,Down,Left,Right} are GLOBAL keybindings (feature/neighbor
    // navigation); the radios are buttons so the dispatcher's text gate does not
    // suppress them, and the Dialog traps only Tab. Stop the consumed keys here so
    // roving between type radios never also mutates the graph selection. Home/End
    // go first/last per the APG radiogroup pattern.
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      moveSelection(1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      moveSelection(-1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      const row = event.key === "Home" ? offered[0] : offered[offered.length - 1];
      if (row) focusOfferedRow(row);
    }
  };

  const removeRelated = (stem: string) => {
    setCreateDocRelated(related.filter((entry) => entry !== stem));
  };

  const isFeatureStage = stage === "feature";

  return (
    <Dialog
      open={open}
      onClose={closeCreateDocDialog}
      title={isFeatureStage ? "Add to a feature" : "Add a document"}
      description={
        isFeatureStage
          ? "Pick the feature this work belongs to, or type a new tag to start one. New documents join the feature's pipeline."
          : "Only documents the pipeline is ready for can be added. Links to the newest upstream documents are pre-filled."
      }
      footer={
        <div className="flex items-center justify-end gap-fg-2">
          <Button variant="secondary" onClick={closeCreateDocDialog}>
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
        {/* Stage announcement (audit stage-transition-not-announced): the dialog's
            retargeted label swap is silent to screen readers, so the step change is
            announced through a visually-hidden polite live region. */}
        <span aria-live="polite" className="sr-only">
          {isFeatureStage
            ? "Step 1 of 2: Add to a feature"
            : "Step 2 of 2: Add a document"}
        </span>
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
            backRef={backRef}
            onRadiogroupKeyDown={onRadiogroupKeyDown}
            onActivateRow={activateOfferedRow}
            title={title}
            related={related}
            corpusDocuments={corpus.documents}
            onAddRelated={addRelated}
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
      // Polite live region (audit coverage-arrival-silent): the async swap from
      // "Checking…" to rows (or the degraded line) is announced. State lines read
      // ink-muted, not ink-faint — they are information-bearing small text
      // (create-panel-hardening ADR ink-faint ruling).
      aria-live="polite"
      className="flex flex-col gap-fg-2 rounded-fg-md border border-rule bg-paper-sunken p-fg-3"
    >
      <p className="text-meta font-medium uppercase tracking-wide text-ink-faint">
        In this feature
      </p>

      {!hasFeature ? (
        <p className="text-label text-ink-muted">
          Pick or type a feature above to see its pipeline.
        </p>
      ) : degraded ? (
        <p className="text-label text-ink-muted">
          Pipeline coverage is unavailable right now.
        </p>
      ) : loading && !coverage ? (
        <p className="text-label text-ink-muted">
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
        <p className="text-label text-ink-muted">
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
        <span className="min-w-0 flex-1 select-text truncate text-meta text-ink-muted">
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
          <span className="text-meta text-ink-muted">Not yet</span>
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
  backRef: React.RefObject<HTMLButtonElement | null>;
  onRadiogroupKeyDown: (event: React.KeyboardEvent) => void;
  onActivateRow: (row: {
    docType: CreateDocType;
    eligible: boolean;
    note: string | undefined;
  }) => void;
  title: string;
  related: string[];
  corpusDocuments: readonly { stem: string; title: string; feature: string | null }[];
  onAddRelated: (stem: string) => void;
  onRemoveRelated: (stem: string) => void;
  onTitleEnter: (event: React.KeyboardEvent) => void;
}

function DocumentStage({
  feature,
  offered,
  selectedType,
  optionRefs,
  backRef,
  onRadiogroupKeyDown,
  onActivateRow,
  title,
  related,
  corpusDocuments,
  onAddRelated,
  onRemoveRelated,
  onTitleEnter,
}: DocumentStageProps) {
  const hintIdBase = useId();
  // Touch floors (audit touch-target-subminimum): the back affordance and chip
  // removal grow to the 2.75rem floor on coarse pointers; both keep a >=24px hit
  // area everywhere (WCAG 2.5.8).
  const coarse = usePointerCoarse();
  return (
    <>
      {/* Sub-header: back to the feature stage + the selected feature pill. The
          Dialog header carries the title; this row carries navigation + context. */}
      <div className="flex items-center gap-fg-2">
        <button
          ref={backRef}
          type="button"
          onClick={goToCreateDocFeatureStage}
          aria-label="Back to feature"
          className={`inline-flex items-center gap-fg-1 rounded-fg-xs px-fg-1 py-fg-1 text-label text-ink-muted transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
            coarse ? "min-h-[2.75rem] min-w-[2.75rem]" : ""
          }`}
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          Back
        </button>
        <span
          className="ml-auto inline-flex min-w-0 items-center rounded-fg-pill border border-rule bg-paper-sunken px-fg-2 py-fg-0-5 text-meta font-medium text-ink-muted"
          data-selected-feature
        >
          <span className="select-text truncate">{feature}</span>
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
            const hintId = `${hintIdBase}-${row.docType}`;
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
                // aria-disabled, NOT disabled (audit disabled-type-reason-unreachable
                // HIGH): the row stays focusable and roving-reachable so keyboard and
                // screen-reader users can reach it and hear WHY it is unavailable —
                // the served reason is programmatically associated below. Activation
                // is a no-op on an ineligible row.
                aria-disabled={row.eligible ? undefined : true}
                aria-describedby={hintId}
                tabIndex={selected ? 0 : -1}
                // Eligible: select. Ineligible: the one-click path to the
                // prerequisite (ADR D3) — activation walks the reason chain and
                // selects the first eligible upstream type instead of a dead no-op.
                onClick={() => onActivateRow(row)}
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
                  <span id={hintId} className="text-meta text-ink-muted">
                    {hint}
                  </span>
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

      {/* Linked documents: always rendered so a removed link is RECOVERABLE by
          keyboard (hardening follow-on) — the corpus-fed add field below re-adds
          any document, the same picker primitive the editor's Related field uses. */}
      <div className="flex flex-col gap-fg-1 text-label text-ink-muted">
        Linked documents
        {related.length > 0 && (
          <ul className="flex flex-wrap gap-fg-1" aria-label="Linked documents">
            {related.map((stem) => (
              <li key={stem}>
                <span
                  className={`inline-flex max-w-full items-center gap-fg-1 rounded-fg-pill border border-rule bg-paper-sunken px-fg-2 py-fg-0-5 text-meta text-ink-muted ${
                    coarse ? "min-h-[2.75rem]" : ""
                  }`}
                >
                  <span className="select-text truncate">{stem}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveRelated(stem)}
                    aria-label={`Remove ${stem}`}
                    className={`shrink-0 rounded-fg-xs p-fg-1 text-ink-muted transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                      coarse ? "min-h-[2.75rem] min-w-[2.75rem]" : ""
                    }`}
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <AutocompleteCombobox
          options={corpusDocuments
            .filter((doc) => !related.includes(doc.stem))
            .map((doc) => ({
              value: doc.stem,
              primary: doc.title,
              secondary: doc.stem,
            }))}
          onCommit={onAddRelated}
          clearOnCommit
          placeholder="Add a linked document"
          ariaLabel="add a linked document"
          emptyLabel="No matching documents"
        />
      </div>
    </>
  );
}
