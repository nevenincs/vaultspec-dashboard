import { useMemo } from "react";

import { create } from "zustand";

export type StatusSectionId =
  | "open-plans"
  | "open-prs"
  | "open-issues"
  | "recent-prs"
  | "recent-commits";

const STATUS_SECTION_IDS = [
  "open-plans",
  "open-prs",
  "open-issues",
  "recent-prs",
  "recent-commits",
] as const satisfies readonly StatusSectionId[];
const STATUS_SECTION_ID_SET = new Set<string>(STATUS_SECTION_IDS);
const DEFAULT_STATUS_SECTION_ID: StatusSectionId = "open-plans";

export const OPEN_RECENT_COMMIT_HASHES_CAP = 64;
export const RECENT_COMMIT_HASH_MAX_CHARS = 128;
export const RECENT_COMMITS_LIMIT_CAP = 200;
export const STATUS_SECTION_TWISTY_PX = 10;

interface StatusTabChromeState {
  sections: Partial<Record<StatusSectionId, boolean>>;
  recentCommitsLimit: number | null;
  openRecentCommitHashes: string[];
  toggleSection: (id: unknown, defaultOpen: unknown) => void;
  toggleRecentCommit: (hash: unknown) => void;
  showMoreRecentCommits: (page: unknown, defaultLimit: unknown) => void;
  reset: () => void;
}

const RESET_STATE = {
  sections: {},
  recentCommitsLimit: null,
  openRecentCommitHashes: [],
};

function boundedPositiveCount(value: unknown, fallback: unknown): number {
  const fallbackCount =
    typeof fallback === "number" && Number.isFinite(fallback)
      ? Math.floor(fallback)
      : 1;
  const candidate =
    value === Number.POSITIVE_INFINITY
      ? RECENT_COMMITS_LIMIT_CAP
      : typeof value === "number" && Number.isFinite(value)
        ? Math.floor(value)
        : fallbackCount;
  const positive = candidate > 0 ? candidate : fallbackCount;
  return Math.min(RECENT_COMMITS_LIMIT_CAP, Math.max(1, positive));
}

export function normalizeStatusSectionId(id: unknown): StatusSectionId | null {
  return typeof id === "string" && STATUS_SECTION_ID_SET.has(id)
    ? (id as StatusSectionId)
    : null;
}

export function normalizeStatusSectionOpen(open: unknown): boolean {
  return typeof open === "boolean" ? open : false;
}

function normalizeRecentCommitHash(hash: unknown): string | null {
  if (typeof hash !== "string") return null;
  const normalized = hash.trim();
  return normalized.length > 0 && normalized.length <= RECENT_COMMIT_HASH_MAX_CHARS
    ? normalized
    : null;
}

function cappedOpenRecentCommitHashes(hashes: unknown): string[] {
  if (!Array.isArray(hashes)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = hashes.length - 1; i >= 0; i -= 1) {
    const hash = normalizeRecentCommitHash(hashes[i]);
    if (hash === null) continue;
    if (seen.has(hash)) continue;
    seen.add(hash);
    out.unshift(hash);
    if (out.length >= OPEN_RECENT_COMMIT_HASHES_CAP) break;
  }
  return out;
}

export const useStatusTabChromeStore = create<StatusTabChromeState>((set) => ({
  ...RESET_STATE,
  toggleSection: (id, defaultOpen) =>
    set((state) => {
      const sectionId = normalizeStatusSectionId(id);
      if (sectionId === null) return state;
      const open = state.sections[sectionId] ?? normalizeStatusSectionOpen(defaultOpen);
      return { sections: { ...state.sections, [sectionId]: !open } };
    }),
  toggleRecentCommit: (hash) =>
    set((state) => {
      const normalizedHash = normalizeRecentCommitHash(hash);
      if (normalizedHash === null) return state;
      const open = state.openRecentCommitHashes.includes(normalizedHash);
      return {
        openRecentCommitHashes: open
          ? state.openRecentCommitHashes.filter(
              (candidate) => candidate !== normalizedHash,
            )
          : cappedOpenRecentCommitHashes([
              ...state.openRecentCommitHashes,
              normalizedHash,
            ]),
      };
    }),
  showMoreRecentCommits: (page, defaultLimit) =>
    set((state) => {
      const current = boundedPositiveCount(
        state.recentCommitsLimit ?? defaultLimit,
        defaultLimit,
      );
      const increment = boundedPositiveCount(page, defaultLimit);
      return {
        recentCommitsLimit: Math.min(RECENT_COMMITS_LIMIT_CAP, current + increment),
      };
    }),
  reset: () => set(RESET_STATE),
}));

export function useStatusSectionOpen(id: unknown, defaultOpen: unknown): boolean {
  const sectionId = normalizeStatusSectionId(id);
  const fallbackOpen = normalizeStatusSectionOpen(defaultOpen);
  return useStatusTabChromeStore((state) =>
    sectionId === null ? fallbackOpen : (state.sections[sectionId] ?? fallbackOpen),
  );
}

// Status sections now render through the centralized `FoldSection` kit primitive
// — the one canonical fold (flush twisty + SectionLabel, no border, no card
// background). The bordered/paper-sunken "section card" chrome that used to live
// here was retired so there is exactly one fold expression across both rails.
export interface StatusSectionChromeView {
  bodyId: string;
  twistyPx: number;
  headerClassName: string;
  bodyClassName: string;
  bodyVisible: boolean;
}

const STATUS_SECTION_HEADER_CLASS =
  "flex w-full items-center gap-fg-2 rounded-fg-xs px-fg-1 py-fg-1-5 text-left transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
const STATUS_SECTION_BODY_CLASS = "px-fg-1 pb-fg-2 pt-fg-0-5";

export function deriveStatusSectionChromeView(
  id: unknown,
  open: unknown,
): StatusSectionChromeView {
  const sectionId = normalizeStatusSectionId(id) ?? DEFAULT_STATUS_SECTION_ID;
  return {
    bodyId: `status-section-${sectionId}`,
    twistyPx: STATUS_SECTION_TWISTY_PX,
    headerClassName: STATUS_SECTION_HEADER_CLASS,
    bodyClassName: STATUS_SECTION_BODY_CLASS,
    bodyVisible: normalizeStatusSectionOpen(open),
  };
}

export interface RecentCommitsChromeView {
  limit: number;
  openHashes: readonly string[];
}

export function deriveRecentCommitsChromeView(
  recentCommitsLimit: unknown,
  openRecentCommitHashes: unknown,
  defaultLimit: unknown,
): RecentCommitsChromeView {
  return {
    limit: boundedPositiveCount(recentCommitsLimit ?? defaultLimit, defaultLimit),
    openHashes: cappedOpenRecentCommitHashes(openRecentCommitHashes),
  };
}

interface RecentCommitChromeInputRow {
  commit: { hash: string };
  hasBody: boolean;
}

export interface RecentCommitChromeRowView<T extends RecentCommitChromeInputRow> {
  row: T;
  expanded: boolean;
  showBody: boolean;
  rootClassName: string;
  headerClassName: string;
  toggleClassName: string;
  rowButtonClassName: string;
  shortHashClassName: string;
  subjectClassName: string;
  ageClassName: string;
}

const RECENT_COMMIT_HEADER_CLASS =
  "flex items-center gap-fg-1-5 rounded-fg-xs px-fg-1 py-fg-1";
const RECENT_COMMIT_TOGGLE_BASE_CLASS =
  "flex shrink-0 items-center rounded-fg-xs text-ink-faint transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
const RECENT_COMMIT_TOGGLE_DISABLED_CLASS = `${RECENT_COMMIT_TOGGLE_BASE_CLASS} opacity-40`;
const RECENT_COMMIT_ROW_BUTTON_CLASS =
  "flex min-w-0 flex-1 items-center gap-fg-1-5 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
const RECENT_COMMIT_SHORT_HASH_CLASS = "shrink-0 font-mono text-meta text-accent-text";
const RECENT_COMMIT_SUBJECT_CLASS = "min-w-0 flex-1 truncate text-label text-ink-muted";
const RECENT_COMMIT_AGE_CLASS = "shrink-0 text-meta text-ink-faint";

export function deriveRecentCommitChromeRows<T extends RecentCommitChromeInputRow>(
  rows: readonly T[],
  openHashes: unknown,
): RecentCommitChromeRowView<T>[] {
  const open = new Set(cappedOpenRecentCommitHashes(openHashes));
  return rows.map((row) => {
    const rowHash = normalizeRecentCommitHash(row.commit.hash);
    const expanded = rowHash !== null && open.has(rowHash);
    return {
      row,
      expanded,
      showBody: expanded && row.hasBody,
      rootClassName: "",
      headerClassName: RECENT_COMMIT_HEADER_CLASS,
      toggleClassName: row.hasBody
        ? RECENT_COMMIT_TOGGLE_BASE_CLASS
        : RECENT_COMMIT_TOGGLE_DISABLED_CLASS,
      rowButtonClassName: RECENT_COMMIT_ROW_BUTTON_CLASS,
      shortHashClassName: RECENT_COMMIT_SHORT_HASH_CLASS,
      subjectClassName: RECENT_COMMIT_SUBJECT_CLASS,
      ageClassName: RECENT_COMMIT_AGE_CLASS,
    };
  });
}

export function useRecentCommitsChrome(defaultLimit: unknown): RecentCommitsChromeView {
  // Select RAW, stable store fields and derive the view in a useMemo — NOT inside
  // the zustand selector. deriveRecentCommitsChromeView re-caps openHashes into a
  // FRESH array, so calling it inside the selector returns a new reference on every
  // getSnapshot and defeats useShallow → React's "getSnapshot should be cached"
  // infinite loop (the right-rail crash). The store already caps on write, so the
  // raw `openRecentCommitHashes` reference is stable between toggles.
  const recentCommitsLimit = useStatusTabChromeStore((s) => s.recentCommitsLimit);
  const openRecentCommitHashes = useStatusTabChromeStore(
    (s) => s.openRecentCommitHashes,
  );
  return useMemo(
    () =>
      deriveRecentCommitsChromeView(
        recentCommitsLimit,
        openRecentCommitHashes,
        defaultLimit,
      ),
    [recentCommitsLimit, openRecentCommitHashes, defaultLimit],
  );
}

export function toggleStatusSection(id: unknown, defaultOpen: unknown): void {
  useStatusTabChromeStore.getState().toggleSection(id, defaultOpen);
}

export function toggleRecentCommit(hash: unknown): void {
  useStatusTabChromeStore.getState().toggleRecentCommit(hash);
}

export function showMoreRecentCommits(page: unknown, defaultLimit: unknown): void {
  useStatusTabChromeStore.getState().showMoreRecentCommits(page, defaultLimit);
}

export function resetStatusTabChrome(): void {
  useStatusTabChromeStore.getState().reset();
}
