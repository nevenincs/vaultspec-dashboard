// Editor lifecycle seam. The editor slice is view-local chrome state, but every
// caller should drive it through these named operations so save-result mapping,
// draft/status transitions, rename drafts, and advisory display stay centralized.

import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

import type { OpsWriteResult } from "../server/engine";
import {
  deriveMarkdownReaderView,
  stemFromNodeId,
  type ContentView,
  type RenameDocResult,
} from "../server/queries";
import { normalizeNodeId } from "../nodeIds";
import { useViewStore, type EditorStatus, type ViewState } from "./viewStore";

export type EditorWriteResult = OpsWriteResult;

export type EditorStatusTone = "muted" | "ink" | "broken";

/** A single vaultspec-core conformance check carried on write/rename results. */
export interface ConformanceCheck {
  check?: string;
  severity?: string;
  message?: string;
  fixable?: boolean;
}

export interface DocumentEditorView {
  isEditing: boolean;
  draftText: string;
  baseBlobHash: string;
  status: EditorStatus;
  statusLabel: string;
  statusTone: EditorStatusTone;
  statusToneClass: string;
  canSave: boolean;
}

export interface MarkdownEditorPropertiesView {
  tags: string;
  date: string;
  related: string;
}

export interface MarkdownEditorFrontmatterDraft {
  tags: string;
  date: string;
  related: string;
}

export interface MarkdownEditorDocumentView {
  canEdit: boolean;
  initialText: string;
  initialBlobHash: string;
  properties: MarkdownEditorPropertiesView;
}

export interface MarkdownEditorAdvisoryRowView {
  key: string;
  toneClass: string;
  marker: string;
  message: string;
  fixableLabel: string | null;
  fixableSuffix: string;
}

export interface MarkdownEditorChromeView {
  currentStem: string;
  renameDraft: string;
  renameTarget: string | null;
  frontmatterDraft: MarkdownEditorFrontmatterDraft;
  hasAdvisories: boolean;
  advisoriesLabel: string;
  advisoryRows: readonly MarkdownEditorAdvisoryRowView[];
}

interface MarkdownEditorChromeState {
  nodeId: string | null;
  renameDraft: string;
  frontmatterDraft: MarkdownEditorFrontmatterDraft;
  advisories: ConformanceCheck[];
  seed: (nodeId: unknown, currentStem: unknown, frontmatterDraft: unknown) => void;
  setRenameDraft: (draft: unknown) => void;
  setFrontmatterDraft: (draft: unknown) => void;
  setAdvisories: (advisories: unknown) => void;
}

export const MARKDOWN_EDITOR_DRAFT_TEXT_MAX_CHARS = 4096;
export const MARKDOWN_EDITOR_ADVISORIES_MAX_ITEMS = 64;
export const MARKDOWN_EDITOR_ADVISORY_TEXT_MAX_CHARS = 1024;

function normalizeEditorDraftText(
  value: unknown,
  maxChars = MARKDOWN_EDITOR_DRAFT_TEXT_MAX_CHARS,
): string {
  if (typeof value !== "string") return "";
  return value.length <= maxChars ? value : value.slice(0, maxChars);
}

const EMPTY_MARKDOWN_EDITOR_FRONTMATTER_DRAFT: MarkdownEditorFrontmatterDraft = {
  tags: "",
  date: "",
  related: "",
};

export function normalizeMarkdownEditorFrontmatterDraft(
  draft: unknown,
): Partial<MarkdownEditorFrontmatterDraft> {
  if (typeof draft !== "object" || draft === null) return {};
  const value = draft as Partial<Record<keyof MarkdownEditorFrontmatterDraft, unknown>>;
  const normalized: Partial<MarkdownEditorFrontmatterDraft> = {};
  for (const key of ["tags", "date", "related"] as const) {
    if (key in value) normalized[key] = normalizeEditorDraftText(value[key]);
  }
  return normalized;
}

export function normalizeMarkdownEditorFrontmatterDraftState(
  draft: unknown,
): MarkdownEditorFrontmatterDraft {
  return {
    ...EMPTY_MARKDOWN_EDITOR_FRONTMATTER_DRAFT,
    ...normalizeMarkdownEditorFrontmatterDraft(draft),
  };
}

function normalizeAdvisoryText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.length <= MARKDOWN_EDITOR_ADVISORY_TEXT_MAX_CHARS
    ? value
    : value.slice(0, MARKDOWN_EDITOR_ADVISORY_TEXT_MAX_CHARS);
}

export function normalizeMarkdownEditorAdvisories(
  advisories: unknown,
): ConformanceCheck[] {
  if (!Array.isArray(advisories)) return [];
  const normalized: ConformanceCheck[] = [];
  for (const advisory of advisories) {
    if (advisory === null || typeof advisory !== "object") continue;
    const value = advisory as Partial<Record<keyof ConformanceCheck, unknown>>;
    normalized.push({
      ...(normalizeAdvisoryText(value.check) !== undefined
        ? { check: normalizeAdvisoryText(value.check) }
        : {}),
      ...(normalizeAdvisoryText(value.severity) !== undefined
        ? { severity: normalizeAdvisoryText(value.severity) }
        : {}),
      ...(normalizeAdvisoryText(value.message) !== undefined
        ? { message: normalizeAdvisoryText(value.message) }
        : {}),
      ...(typeof value.fixable === "boolean" ? { fixable: value.fixable } : {}),
    });
    if (normalized.length >= MARKDOWN_EDITOR_ADVISORIES_MAX_ITEMS) break;
  }
  return normalized;
}

const useMarkdownEditorChromeStore = create<MarkdownEditorChromeState>((set) => ({
  nodeId: null,
  renameDraft: "",
  frontmatterDraft: EMPTY_MARKDOWN_EDITOR_FRONTMATTER_DRAFT,
  advisories: [],
  seed: (nodeId, currentStem, frontmatterDraft) =>
    set((state) => {
      const normalizedNodeId = normalizeNodeId(nodeId);
      if (normalizedNodeId === null) return state;
      const normalizedStem = normalizeEditorDraftText(currentStem);
      const normalizedFrontmatter =
        normalizeMarkdownEditorFrontmatterDraftState(frontmatterDraft);
      return state.nodeId === normalizedNodeId
        ? state
        : {
            nodeId: normalizedNodeId,
            renameDraft: normalizedStem,
            frontmatterDraft: normalizedFrontmatter,
            advisories: [],
          };
    }),
  setRenameDraft: (draft) => set({ renameDraft: normalizeEditorDraftText(draft) }),
  setFrontmatterDraft: (draft) =>
    set((state) => ({
      frontmatterDraft: {
        ...state.frontmatterDraft,
        ...normalizeMarkdownEditorFrontmatterDraft(draft),
      },
    })),
  setAdvisories: (advisories) =>
    set({ advisories: normalizeMarkdownEditorAdvisories(advisories) }),
}));

export function deriveMarkdownEditorChromeView(
  state: Pick<
    MarkdownEditorChromeState,
    "nodeId" | "renameDraft" | "frontmatterDraft" | "advisories"
  >,
  nodeId: unknown,
  currentStem: unknown,
  sourceFrontmatterDraft: unknown,
): MarkdownEditorChromeView {
  const normalizedNodeId = normalizeNodeId(nodeId) ?? "";
  const normalizedCurrentStem = normalizeEditorDraftText(currentStem);
  const renameDraft =
    state.nodeId === normalizedNodeId ? state.renameDraft : normalizedCurrentStem;
  const frontmatterDraft =
    state.nodeId === normalizedNodeId
      ? normalizeMarkdownEditorFrontmatterDraftState(state.frontmatterDraft)
      : normalizeMarkdownEditorFrontmatterDraftState(sourceFrontmatterDraft);
  const trimmedRename = renameDraft.trim();
  const advisories =
    state.nodeId === normalizedNodeId
      ? normalizeMarkdownEditorAdvisories(state.advisories)
      : [];
  return {
    currentStem: normalizedCurrentStem,
    renameDraft,
    renameTarget:
      trimmedRename.length > 0 && trimmedRename !== normalizedCurrentStem
        ? trimmedRename
        : null,
    frontmatterDraft,
    hasAdvisories: advisories.length > 0,
    advisoriesLabel: "Conformance advisories",
    advisoryRows: advisories.map((check, index) => {
      const error = check.severity === "error";
      return {
        key: `${check.check ?? "check"}-${index}`,
        toneClass: error ? "text-state-broken" : "text-ink-muted",
        marker: error ? "x" : "!",
        message: check.message ?? check.check ?? "advisory",
        fixableLabel: check.fixable ? "fixable" : null,
        fixableSuffix: check.fixable ? " - fixable" : "",
      };
    }),
  };
}

const STATUS_LABEL: Record<EditorStatus, string> = {
  idle: "Saved",
  dirty: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  "save-failed": "Save failed",
  conflict: "Conflict — the file changed on disk",
};

function editorStatusTone(status: EditorStatus): EditorStatusTone {
  if (status === "conflict" || status === "save-failed") return "broken";
  if (status === "dirty") return "ink";
  return "muted";
}

function editorStatusToneClass(tone: EditorStatusTone): string {
  if (tone === "broken") return "text-state-broken";
  if (tone === "ink") return "text-ink";
  return "text-ink-muted";
}

export function deriveDocumentEditorView(
  state: Pick<
    ViewState,
    "editorTarget" | "draftText" | "baseBlobHash" | "editorStatus"
  >,
  nodeId: unknown,
): DocumentEditorView {
  const normalizedNodeId = normalizeNodeId(nodeId);
  const status = state.editorStatus;
  const statusTone = editorStatusTone(status);
  return {
    isEditing:
      normalizedNodeId !== null && state.editorTarget?.nodeId === normalizedNodeId,
    draftText: state.draftText,
    baseBlobHash: state.baseBlobHash,
    status,
    statusLabel: STATUS_LABEL[status],
    statusTone,
    statusToneClass: editorStatusToneClass(statusTone),
    canSave: status === "dirty" || status === "save-failed",
  };
}

export function useDocumentEditorView(nodeId: unknown): DocumentEditorView {
  return useViewStore(useShallow((state) => deriveDocumentEditorView(state, nodeId)));
}

export function useMarkdownEditorChromeView(
  nodeId: unknown,
  frontmatterDraft: unknown,
): MarkdownEditorChromeView {
  const normalizedNodeId = normalizeNodeId(nodeId) ?? "";
  const currentStem = normalizedNodeId ? stemFromNodeId(normalizedNodeId) : "";
  const seed = useMarkdownEditorChromeStore((state) => state.seed);
  // Select the RAW, referentially-stable store fields and derive the view in a
  // useMemo — NEVER derive inside the zustand selector. deriveMarkdownEditorChromeView
  // returns NESTED fresh objects (the `frontmatterDraft` object + the `advisoryRows`
  // array), so calling it inside a `useShallow` selector returns a new value on every
  // getSnapshot — useShallow only compares one level deep, so the nested fresh refs
  // defeat it -> React's "getSnapshot should be cached" -> "Maximum update depth
  // exceeded", which crashed the stage on every markdown-document open
  // (stable-selectors / bounded-by-default sibling discipline).
  const stateNodeId = useMarkdownEditorChromeStore((state) => state.nodeId);
  const renameDraft = useMarkdownEditorChromeStore((state) => state.renameDraft);
  const stateFrontmatterDraft = useMarkdownEditorChromeStore(
    (state) => state.frontmatterDraft,
  );
  const advisories = useMarkdownEditorChromeStore((state) => state.advisories);
  useEffect(() => {
    seed(normalizedNodeId, currentStem, frontmatterDraft);
  }, [currentStem, frontmatterDraft, normalizedNodeId, seed]);
  return useMemo(
    () =>
      deriveMarkdownEditorChromeView(
        {
          nodeId: stateNodeId,
          renameDraft,
          frontmatterDraft: stateFrontmatterDraft,
          advisories,
        },
        normalizedNodeId,
        currentStem,
        frontmatterDraft,
      ),
    [
      stateNodeId,
      renameDraft,
      stateFrontmatterDraft,
      advisories,
      normalizedNodeId,
      currentStem,
      frontmatterDraft,
    ],
  );
}

export function deriveMarkdownEditorDocumentView(
  content: ContentView,
): MarkdownEditorDocumentView {
  const frontmatter = deriveMarkdownReaderView(content).frontmatter;
  return {
    // A truncated body is only a PREFIX of the document (the engine capped the served
    // bytes), so editing it and saving would write that prefix back and silently drop
    // everything past the cap — the same data-loss class as the unsaved-draft gaps.
    // Disable editing until the full body is available.
    canEdit: content.available && content.truncated === null,
    initialText: content.text,
    initialBlobHash: content.blobHash ?? "",
    properties: {
      tags: frontmatter?.tags.map((tag) => tag.label).join(", ") ?? "",
      date: frontmatter?.dates.find((date) => date.label === "created")?.value ?? "",
      related: frontmatter?.related.map((related) => related.stem).join(", ") ?? "",
    },
  };
}

function commaList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function deriveMarkdownEditorFrontmatterPatch(
  draft: MarkdownEditorFrontmatterDraft,
): { tags?: string[]; date?: string; related?: string[] } {
  return {
    tags: commaList(draft.tags),
    date: draft.date.trim() || undefined,
    related: commaList(draft.related),
  };
}

export function openDocumentEditor(
  nodeId: unknown,
  text: unknown,
  baseBlobHash: unknown,
): void {
  useViewStore.getState().openEditor(nodeId, text, baseBlobHash);
}

export function updateEditorDraft(text: unknown): void {
  useViewStore.getState().setDraft(text);
}

export function markEditorSaving(): void {
  useViewStore.getState().markSaving();
}

export function markEditorSaved(blobHash: unknown): void {
  useViewStore.getState().markSaved(blobHash);
}

export function markEditorConflict(): void {
  useViewStore.getState().markConflict();
}

export function markEditorFailed(): void {
  useViewStore.getState().markFailed();
}

export function closeDocumentEditor(): void {
  useViewStore.getState().closeEditor();
}

export function setMarkdownEditorRenameDraft(draft: unknown): void {
  useMarkdownEditorChromeStore.getState().setRenameDraft(draft);
}

export function setMarkdownEditorFrontmatterDraft(draft: unknown): void {
  useMarkdownEditorChromeStore.getState().setFrontmatterDraft(draft);
}

export function conformanceChecksOf(result: {
  kind: OpsWriteResult["kind"];
  checks?: unknown;
}): ConformanceCheck[] {
  if (result.kind !== "saved" && result.kind !== "refused") return [];
  return normalizeMarkdownEditorAdvisories(result.checks);
}

export function setMarkdownEditorAdvisories(advisories: unknown): void {
  useMarkdownEditorChromeStore.getState().setAdvisories(advisories);
}

export function applyEditorWriteResult(result: EditorWriteResult): void {
  setMarkdownEditorAdvisories(conformanceChecksOf(result));
  if (result.kind === "saved") {
    markEditorSaved(result.blobHash);
    return;
  }
  if (result.kind === "conflict") {
    markEditorConflict();
    return;
  }
  if (result.kind === "refused") {
    markEditorFailed();
    return;
  }
  if (result.kind === "created") {
    return;
  }

  const exhaustive: never = result;
  return exhaustive;
}

export function applyRenameEditorResult(result: RenameDocResult): void {
  if (result.kind === "renamed") {
    setMarkdownEditorAdvisories([]);
    return;
  }
  if (result.kind === "conflict") {
    setMarkdownEditorAdvisories([]);
    markEditorConflict();
    return;
  }
  if (result.kind === "refused") {
    setMarkdownEditorAdvisories(conformanceChecksOf(result));
    markEditorFailed();
    return;
  }
  if (result.kind === "collision") {
    setMarkdownEditorAdvisories([
      { severity: "error", message: result.message, fixable: false },
    ]);
    markEditorFailed();
    return;
  }

  const exhaustive: never = result;
  return exhaustive;
}
