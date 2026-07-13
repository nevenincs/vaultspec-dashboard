import { useMemo } from "react";
import { create } from "zustand";

// Create-document chrome state: modal visibility, draft fields, and validation
// feedback. The write itself stays in stores/server/useCreateDoc.
export const CREATE_DOC_TYPES = ["research", "adr", "plan", "reference"] as const;
export type CreateDocType = (typeof CREATE_DOC_TYPES)[number];
export const DEFAULT_CREATE_DOC_TYPE: CreateDocType = "research";
export const CREATE_DOC_DRAFT_TEXT_MAX_CHARS = 512;
export const CREATE_DOC_ERROR_MAX_CHARS = 1024;

export interface CreateDocChromeState {
  open: boolean;
  docType: CreateDocType;
  feature: string;
  title: string;
  error: string | null;
  /** A one-shot request to move focus to the feature field when the dialog opens
   *  (set by the Features-section create affordance, D5/D6). Cleared once consumed. */
  focusFeatureField: boolean;
  toggleOpen: () => void;
  setDocType: (docType: unknown) => void;
  setFeature: (feature: unknown) => void;
  setTitle: (title: unknown) => void;
  setError: (error: unknown) => void;
  setFocusFeatureField: (focus: boolean) => void;
  reset: () => void;
}

const RESET_STATE = {
  open: false,
  docType: DEFAULT_CREATE_DOC_TYPE,
  feature: "",
  title: "",
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

export function normalizeCreateDocDraftText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.length <= CREATE_DOC_DRAFT_TEXT_MAX_CHARS
    ? value
    : value.slice(0, CREATE_DOC_DRAFT_TEXT_MAX_CHARS);
}

export function normalizeCreateDocError(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized =
    value.length <= CREATE_DOC_ERROR_MAX_CHARS
      ? value
      : value.slice(0, CREATE_DOC_ERROR_MAX_CHARS);
  return normalized.trim().length > 0 ? normalized : null;
}

export interface CreateDocChromeView {
  open: boolean;
  docType: CreateDocType;
  feature: string;
  title: string;
  error: string | null;
  focusFeatureField: boolean;
}

export function normalizeCreateDocChromeView(state: unknown): CreateDocChromeView {
  const value =
    state !== null && typeof state === "object"
      ? (state as Partial<Record<keyof CreateDocChromeView, unknown>>)
      : {};
  return {
    open: value.open === true,
    docType: normalizeCreateDocType(value.docType) ?? DEFAULT_CREATE_DOC_TYPE,
    feature: normalizeCreateDocDraftText(value.feature),
    title: normalizeCreateDocDraftText(value.title),
    error: normalizeCreateDocError(value.error),
    focusFeatureField: value.focusFeatureField === true,
  };
}

export const useCreateDocChromeStore = create<CreateDocChromeState>((set) => ({
  ...RESET_STATE,
  toggleOpen: () =>
    set((state) =>
      state.open
        ? RESET_STATE
        : { ...normalizeCreateDocChromeView(state), open: true, error: null },
    ),
  setDocType: (docType) =>
    set((state) => {
      const normalized = normalizeCreateDocType(docType);
      return normalized === null || normalized === state.docType
        ? state
        : { docType: normalized };
    }),
  setFeature: (feature) => set({ feature: normalizeCreateDocDraftText(feature) }),
  setTitle: (title) => set({ title: normalizeCreateDocDraftText(title) }),
  setError: (error) => set({ error: normalizeCreateDocError(error) }),
  setFocusFeatureField: (focus) => set({ focusFeatureField: focus === true }),
  reset: () => set(RESET_STATE),
}));

export type CreateDocSubmission =
  | {
      ok: true;
      docType: CreateDocType;
      feature: string;
      title: string;
    }
  | {
      ok: false;
      error: string;
    };

type CreateDocSubmissionDraft = Partial<
  Record<"docType" | "feature" | "title", unknown>
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
    return { ok: false, error: "Unsupported document type" };
  }
  const feature = normalizeCreateDocDraftText(value.feature).trim();
  const title = normalizeCreateDocDraftText(value.title).trim();
  if (!feature || !title) {
    return { ok: false, error: "Feature and title are required" };
  }
  return {
    ok: true,
    docType,
    feature,
    title,
  };
}

export function useCreateDocChrome(): CreateDocChromeView {
  // Select the RAW stable fields; derive the view in useMemo (stable-selectors) —
  // never inside the selector, even under useShallow.
  const open = useCreateDocChromeStore((state) => state.open);
  const docType = useCreateDocChromeStore((state) => state.docType);
  const feature = useCreateDocChromeStore((state) => state.feature);
  const title = useCreateDocChromeStore((state) => state.title);
  const error = useCreateDocChromeStore((state) => state.error);
  const focusFeatureField = useCreateDocChromeStore((state) => state.focusFeatureField);
  return useMemo(
    () =>
      normalizeCreateDocChromeView({
        open,
        docType,
        feature,
        title,
        error,
        focusFeatureField,
      }),
    [open, docType, feature, title, error, focusFeatureField],
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

export function setCreateDocType(docType: unknown): void {
  useCreateDocChromeStore.getState().setDocType(docType);
}

export function setCreateDocFeature(feature: unknown): void {
  useCreateDocChromeStore.getState().setFeature(feature);
}

export function setCreateDocTitle(title: unknown): void {
  useCreateDocChromeStore.getState().setTitle(title);
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

export function resetCreateDocChrome(): void {
  useCreateDocChromeStore.getState().reset();
}
