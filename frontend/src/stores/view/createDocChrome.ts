import { useMemo } from "react";
import { create } from "zustand";

import type { FeatureCoverage } from "../server/engine";

// Create-document chrome state (feature-group-authoring ADR D1/D5): a two-stage
// feature-first flow. Stage 1 selects-or-creates a feature; stage 2 adds an
// ELIGIBLE document to it with a deterministically pre-filled, editable related-
// links row. This module holds the pure draft + transitions + the coverage-derived
// derivations (offered types, eligibility reconciliation, D5 link seeding); the
// write itself stays in stores/server/useCreateDoc, and the served coverage is read
// by the panel through useFeatureCoverageView. exec is NOT an offered type (ADR D4:
// exec records are plan-derived scaffolds); it left the set rather than shipping a
// permanently-disabled lie.
export const CREATE_DOC_TYPES = [
  "research",
  "reference",
  "adr",
  "plan",
  "audit",
] as const;
export type CreateDocType = (typeof CREATE_DOC_TYPES)[number];
export const DEFAULT_CREATE_DOC_TYPE: CreateDocType = "research";

/** The two panel stages (ADR D1): select-or-create the feature, then add a
 *  document to it. The panel opens on `feature`; Continue advances to `document`,
 *  Back returns. */
export const CREATE_DOC_STAGES = ["feature", "document"] as const;
export type CreateDocStage = (typeof CREATE_DOC_STAGES)[number];
export const DEFAULT_CREATE_DOC_STAGE: CreateDocStage = "feature";

export const CREATE_DOC_DRAFT_TEXT_MAX_CHARS = 512;
export const CREATE_DOC_ISSUES = [
  "choose-feature",
  "complete-required-fields",
  "choose-document-type",
  "choose-available-document-type",
  "requires-research-or-reference",
  "requires-decision",
  "path-collision",
  "scope-changed",
  "project-changed",
  "in-flight",
  "create-failed",
] as const;
export type CreateDocIssue = (typeof CREATE_DOC_ISSUES)[number];
/** Bound the editable related-links list (bounded-by-default): a cross-link pre-fill
 *  is a handful of upstream stems, never an unbounded paste. */
export const CREATE_DOC_RELATED_MAX = 16;

export interface CreateDocChromeState {
  open: boolean;
  /** The active stage (ADR D1). */
  stage: CreateDocStage;
  docType: CreateDocType;
  feature: string;
  title: string;
  /** The editable cross-link pre-fill (ADR D5), seeded from served coverage and
   *  freely edited before submit. */
  related: string[];
  error: CreateDocIssue | null;
  /** A one-shot request to move focus to the feature field when the dialog opens
   *  (set by the Features-section create affordance, D5/D6). Cleared once consumed. */
  focusFeatureField: boolean;
  toggleOpen: () => void;
  close: () => void;
  setStage: (stage: unknown) => void;
  goToDocumentStage: () => void;
  goToFeatureStage: () => void;
  setDocType: (docType: unknown) => void;
  setFeature: (feature: unknown) => void;
  setTitle: (title: unknown) => void;
  setRelated: (related: unknown) => void;
  setError: (error: unknown) => void;
  setFocusFeatureField: (focus: boolean) => void;
  reset: () => void;
}

const RESET_STATE = {
  open: false,
  stage: DEFAULT_CREATE_DOC_STAGE,
  docType: DEFAULT_CREATE_DOC_TYPE,
  feature: "",
  title: "",
  related: [] as string[],
  error: null,
  focusFeatureField: false,
};

export function isCreateDocType(value: string): value is CreateDocType {
  return CREATE_DOC_TYPES.includes(value as CreateDocType);
}

export function normalizeCreateDocType(value: unknown): CreateDocType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return isCreateDocType(normalized) ? normalized : null;
}

export function isCreateDocStage(value: string): value is CreateDocStage {
  return CREATE_DOC_STAGES.includes(value as CreateDocStage);
}

export function normalizeCreateDocStage(value: unknown): CreateDocStage {
  if (typeof value !== "string") return DEFAULT_CREATE_DOC_STAGE;
  const normalized = value.trim();
  return isCreateDocStage(normalized) ? normalized : DEFAULT_CREATE_DOC_STAGE;
}

export function normalizeCreateDocDraftText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.length <= CREATE_DOC_DRAFT_TEXT_MAX_CHARS
    ? value
    : value.slice(0, CREATE_DOC_DRAFT_TEXT_MAX_CHARS);
}

/** Normalize the editable related list at the store boundary: keep only trimmed,
 *  non-empty strings, de-duplicated, each bounded, and the whole list capped —
 *  so a corrupted or over-long value never enters the draft. */
export function normalizeCreateDocRelated(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim().slice(0, CREATE_DOC_DRAFT_TEXT_MAX_CHARS);
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= CREATE_DOC_RELATED_MAX) break;
  }
  return out;
}

export function normalizeCreateDocError(value: unknown): CreateDocIssue | null {
  return typeof value === "string" &&
    CREATE_DOC_ISSUES.includes(value as CreateDocIssue)
    ? (value as CreateDocIssue)
    : null;
}

export interface CreateDocChromeView {
  open: boolean;
  stage: CreateDocStage;
  docType: CreateDocType;
  feature: string;
  title: string;
  related: string[];
  error: CreateDocIssue | null;
  focusFeatureField: boolean;
}

export function normalizeCreateDocChromeView(state: unknown): CreateDocChromeView {
  const value =
    state !== null && typeof state === "object"
      ? (state as Partial<Record<keyof CreateDocChromeView, unknown>>)
      : {};
  return {
    open: value.open === true,
    stage: normalizeCreateDocStage(value.stage),
    docType: normalizeCreateDocType(value.docType) ?? DEFAULT_CREATE_DOC_TYPE,
    feature: normalizeCreateDocDraftText(value.feature),
    title: normalizeCreateDocDraftText(value.title),
    related: normalizeCreateDocRelated(value.related),
    error: normalizeCreateDocError(value.error),
    focusFeatureField: value.focusFeatureField === true,
  };
}

export const useCreateDocChromeStore = create<CreateDocChromeState>((set) => ({
  ...RESET_STATE,
  toggleOpen: () =>
    set((state) =>
      state.open
        ? // Dismiss PRESERVES the draft (create-panel-hardening ADR): an
          // accidental toggle/Escape must never wipe a typed feature, title, or
          // edited link list. Only a successful create resets (`reset`).
          { open: false, error: null, focusFeatureField: false }
        : {
            ...normalizeCreateDocChromeView(state),
            open: true,
            // A fresh open always starts at stage 1 with a clean error; the
            // preserved draft (feature/title/related) carries across.
            stage: DEFAULT_CREATE_DOC_STAGE,
            error: null,
          },
    ),
  // Every dismiss path (Escape, backdrop, Cancel, close button) closes and clears
  // the transient error while KEEPING the draft; reset-on-success stays `reset`.
  close: () => set({ open: false, error: null, focusFeatureField: false }),
  setStage: (stage) => set({ stage: normalizeCreateDocStage(stage) }),
  // Advancing to the document stage clears any stale stage-1 error so a prior
  // validation message never bleeds across the transition.
  goToDocumentStage: () => set({ stage: "document", error: null }),
  goToFeatureStage: () => set({ stage: "feature", error: null }),
  setDocType: (docType) =>
    set((state) => {
      const normalized = normalizeCreateDocType(docType);
      return normalized === null || normalized === state.docType
        ? state
        : { docType: normalized };
    }),
  setFeature: (feature) => set({ feature: normalizeCreateDocDraftText(feature) }),
  setTitle: (title) => set({ title: normalizeCreateDocDraftText(title) }),
  setRelated: (related) => set({ related: normalizeCreateDocRelated(related) }),
  setError: (error) => set({ error: normalizeCreateDocError(error) }),
  setFocusFeatureField: (focus) => set({ focusFeatureField: focus === true }),
  reset: () => set(RESET_STATE),
}));

// --- coverage-derived derivations (pure; consume the served FeatureCoverage) -----
//
// Eligibility and the newest link-target stems are ENGINE-SERVED (ADR D3): these
// helpers only READ the served coverage, never recompute the hierarchy gate. The
// panel calls them when coverage (or the selected type) changes and feeds the
// result back through the store setters — keeping the store itself free of any
// wire dependency (store-selectors-return-raw-state).

/** One offered type row the document stage renders: the served coverage for an
 *  OFFERED type (exec excluded, ADR D4), carrying the served eligibility + reason
 *  the panel renders disabled-with-reason. */
export interface OfferedCreateDocType {
  docType: CreateDocType;
  present: boolean;
  count: number;
  eligible: boolean;
  /** The served note token (`requires-research-or-reference`, `requires-adr`,
   *  `no-upstream`), for the panel to map to plain language. */
  note: string | undefined;
  newestStem: string | undefined;
}

function coverageTypeOf(coverage: FeatureCoverage | undefined, docType: string) {
  return coverage?.types.find((t) => t.doc_type === docType);
}

/**
 * The offered document types for the current feature, in the panel's order (ADR
 * D4: exec is never offered). Each row carries the served eligibility/note so the
 * panel disables an ineligible type WITH its reason rather than hiding the
 * pipeline. Absent coverage yields the conservative floor (only the always-open
 * entry points eligible) — the panel gates on the tiers block regardless.
 */
export function deriveOfferedCreateDocTypes(
  coverage: FeatureCoverage | undefined,
): OfferedCreateDocType[] {
  return CREATE_DOC_TYPES.map((docType) => {
    const served = coverageTypeOf(coverage, docType);
    return {
      docType,
      present: served?.present ?? false,
      count: served?.count ?? 0,
      // research/reference are the always-open entry points even with no served
      // coverage (a brand-new feature the engine has not observed); every other
      // type defaults ineligible until the served flag says otherwise.
      eligible: served?.eligible ?? (docType === "research" || docType === "reference"),
      note: served?.note,
      newestStem: served?.newest_stem,
    };
  });
}

/** Is the selected type eligible under the served coverage? Reads the served flag
 *  (never recomputes it); the always-open entry points stay eligible when coverage
 *  is absent. */
export function isCreateDocTypeEligible(
  docType: CreateDocType,
  coverage: FeatureCoverage | undefined,
): boolean {
  const served = coverageTypeOf(coverage, docType);
  if (served) return served.eligible;
  return docType === "research" || docType === "reference";
}

/**
 * Reconcile the selected type against served eligibility (ADR D3): if the current
 * selection is still eligible it stands; otherwise it resets honestly to the
 * advised next step (when that is an offered, eligible type), else the first
 * eligible offered type, else the always-eligible entry point. The panel applies
 * the result when coverage arrives or changes so a type that turns ineligible is
 * never left selected.
 */
export function reconcileCreateDocType(
  selected: CreateDocType,
  coverage: FeatureCoverage | undefined,
): CreateDocType {
  if (isCreateDocTypeEligible(selected, coverage)) return selected;
  const nextStep = coverage?.next_step;
  if (
    nextStep &&
    isCreateDocType(nextStep) &&
    isCreateDocTypeEligible(nextStep, coverage)
  ) {
    return nextStep;
  }
  const firstEligible = CREATE_DOC_TYPES.find((docType) =>
    isCreateDocTypeEligible(docType, coverage),
  );
  return firstEligible ?? DEFAULT_CREATE_DOC_TYPE;
}

/**
 * The deterministic cross-link pre-fill for a doc type (ADR D5), read from served
 * coverage: adr ← the feature's newest research AND reference stems; plan ← newest
 * adr; audit ← newest plan (when present); research/reference ← none. No client
 * fuzzy matching — only stems the engine has already observed. The result is the
 * seed for the editable related row, not a final value.
 */
export function seedRelatedFromCoverage(
  docType: CreateDocType,
  coverage: FeatureCoverage | undefined,
): string[] {
  const newest = (type: string): string | undefined =>
    coverageTypeOf(coverage, type)?.newest_stem;
  const stems: (string | undefined)[] = (() => {
    switch (docType) {
      case "adr":
        return [newest("research"), newest("reference")];
      case "plan":
        return [newest("adr")];
      case "audit":
        return [newest("plan")];
      default:
        return [];
    }
  })();
  return normalizeCreateDocRelated(stems.filter((s): s is string => Boolean(s)));
}

export type CreateDocSubmission =
  | {
      ok: true;
      docType: CreateDocType;
      feature: string;
      title: string;
      related: string[];
    }
  | {
      ok: false;
      issue: CreateDocIssue;
    };

type CreateDocSubmissionDraft = Partial<
  Record<"docType" | "feature" | "title" | "related", unknown>
>;

function createDocSubmissionDraftRecord(draft: unknown): CreateDocSubmissionDraft {
  return draft !== null && typeof draft === "object"
    ? (draft as CreateDocSubmissionDraft)
    : {};
}

export function deriveCreateDocSubmission(draft: unknown): CreateDocSubmission {
  const value = createDocSubmissionDraftRecord(draft);
  const docType = normalizeCreateDocType(value.docType);
  if (docType === null) {
    return { ok: false, issue: "choose-document-type" };
  }
  const feature = normalizeCreateDocDraftText(value.feature).trim();
  const title = normalizeCreateDocDraftText(value.title).trim();
  if (!feature || !title) {
    return { ok: false, issue: "complete-required-fields" };
  }
  return {
    ok: true,
    docType,
    feature,
    title,
    related: normalizeCreateDocRelated(value.related),
  };
}

export function useCreateDocChrome(): CreateDocChromeView {
  // Select the RAW stable fields; derive the view in useMemo (stable-selectors) —
  // never inside the selector, even under useShallow.
  const open = useCreateDocChromeStore((state) => state.open);
  const stage = useCreateDocChromeStore((state) => state.stage);
  const docType = useCreateDocChromeStore((state) => state.docType);
  const feature = useCreateDocChromeStore((state) => state.feature);
  const title = useCreateDocChromeStore((state) => state.title);
  const related = useCreateDocChromeStore((state) => state.related);
  const error = useCreateDocChromeStore((state) => state.error);
  const focusFeatureField = useCreateDocChromeStore((state) => state.focusFeatureField);
  return useMemo(
    () =>
      normalizeCreateDocChromeView({
        open,
        stage,
        docType,
        feature,
        title,
        related,
        error,
        focusFeatureField,
      }),
    [open, stage, docType, feature, title, related, error, focusFeatureField],
  );
}

export function toggleCreateDocDialog(): void {
  useCreateDocChromeStore.getState().toggleOpen();
}

export interface OpenCreateDocOptions {
  /** Move focus to the feature field once the dialog opens (the Features-section
   *  create affordance, D5/D6). */
  focusFeature?: boolean;
}

/**
 * Open the create-document dialog from any surface (left rail, command palette,
 * keyboard, context menu), optionally pre-filling the feature tag and requesting
 * focus on the feature field. Unlike {@link toggleCreateDocDialog} this is
 * idempotent-open: it never closes an already-open dialog, so two surfaces racing to
 * "new document" converge on one open dialog rather than toggling each other shut.
 */
export function openCreateDocDialog(
  prefillFeature?: unknown,
  options?: OpenCreateDocOptions,
): void {
  const store = useCreateDocChromeStore.getState();
  if (!store.open) store.toggleOpen();
  const feature = normalizeCreateDocDraftText(prefillFeature).trim();
  if (feature.length > 0) store.setFeature(feature);
  if (options?.focusFeature === true) store.setFocusFeatureField(true);
}

export function setCreateDocStage(stage: unknown): void {
  useCreateDocChromeStore.getState().setStage(stage);
}

export function goToCreateDocDocumentStage(): void {
  useCreateDocChromeStore.getState().goToDocumentStage();
}

export function goToCreateDocFeatureStage(): void {
  useCreateDocChromeStore.getState().goToFeatureStage();
}

export function setCreateDocType(docType: unknown): void {
  useCreateDocChromeStore.getState().setDocType(docType);
}

export function setCreateDocFeature(feature: unknown): void {
  useCreateDocChromeStore.getState().setFeature(feature);
}

export function setCreateDocTitle(title: unknown): void {
  useCreateDocChromeStore.getState().setTitle(title);
}

export function setCreateDocRelated(related: unknown): void {
  useCreateDocChromeStore.getState().setRelated(related);
}

export function setCreateDocError(error: unknown): void {
  useCreateDocChromeStore.getState().setError(error);
}

/** Consume the one-shot feature-focus request: read whether it is set and clear it in
 *  the same call, so the dialog focuses the feature field exactly once per open. */
export function consumeCreateDocFocusFeature(): boolean {
  const store = useCreateDocChromeStore.getState();
  if (!store.focusFeatureField) return false;
  store.setFocusFeatureField(false);
  return true;
}

/** Dismiss the dialog PRESERVING the draft (create-panel-hardening ADR): Escape,
 *  backdrop, Cancel, and the close button all route here so an accidental dismiss
 *  never loses typed work. A reopen restores the draft at stage 1. */
export function closeCreateDocDialog(): void {
  useCreateDocChromeStore.getState().close();
}

/** Full reset — the SUCCESSFUL-create path (and tests). Wipes the draft. */
export function resetCreateDocChrome(): void {
  useCreateDocChromeStore.getState().reset();
}
