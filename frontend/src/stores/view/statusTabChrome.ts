import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

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

export const OPEN_RECENT_COMMIT_HASHES_CAP = 64;
export const RECENT_COMMITS_LIMIT_CAP = 200;
export const STATUS_SECTION_TWISTY_PX = 10;

interface StatusTabChromeState {
  sections: Partial<Record<StatusSectionId, boolean>>;
  recentCommitsLimit: number | null;
  openRecentCommitHashes: string[];
  toggleSection: (id: StatusSectionId, defaultOpen: boolean) => void;
  toggleRecentCommit: (hash: string) => void;
  showMoreRecentCommits: (page: number, defaultLimit: number) => void;
  reset: () => void;
}

const RESET_STATE = {
  sections: {},
  recentCommitsLimit: null,
  openRecentCommitHashes: [],
};

function boundedPositiveCount(value: number, fallback: number): number {
  const candidate =
    value === Number.POSITIVE_INFINITY
      ? RECENT_COMMITS_LIMIT_CAP
      : Number.isFinite(value)
        ? Math.floor(value)
        : fallback;
  const positive = candidate > 0 ? candidate : fallback;
  return Math.min(RECENT_COMMITS_LIMIT_CAP, Math.max(1, positive));
}

function normalizeStatusSectionId(id: unknown): StatusSectionId | null {
  return typeof id === "string" && STATUS_SECTION_ID_SET.has(id)
    ? (id as StatusSectionId)
    : null;
}

function cappedOpenRecentCommitHashes(hashes: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = hashes.length - 1; i >= 0; i -= 1) {
    const hash = hashes[i].trim();
    if (!hash) continue;
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
      const open = state.sections[sectionId] ?? defaultOpen;
      return { sections: { ...state.sections, [sectionId]: !open } };
    }),
  toggleRecentCommit: (hash) =>
    set((state) => {
      const normalizedHash = hash.trim();
      if (!normalizedHash) return state;
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

export function useStatusSectionOpen(
  id: StatusSectionId,
  defaultOpen: boolean,
): boolean {
  return useStatusTabChromeStore((state) => state.sections[id] ?? defaultOpen);
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
  id: StatusSectionId,
  open: boolean,
): StatusSectionChromeView {
  return {
    bodyId: `status-section-${id}`,
    twistyPx: STATUS_SECTION_TWISTY_PX,
    headerClassName: STATUS_SECTION_HEADER_CLASS,
    bodyClassName: STATUS_SECTION_BODY_CLASS,
    bodyVisible: open,
  };
}

export interface RecentCommitsChromeView {
  limit: number;
  openHashes: readonly string[];
}

export function deriveRecentCommitsChromeView(
  recentCommitsLimit: number | null,
  openRecentCommitHashes: readonly string[],
  defaultLimit: number,
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
  openHashes: readonly string[],
): RecentCommitChromeRowView<T>[] {
  const open = new Set(openHashes);
  return rows.map((row) => {
    const expanded = open.has(row.commit.hash);
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

export function useRecentCommitsChrome(defaultLimit: number): RecentCommitsChromeView {
  return useStatusTabChromeStore(
    useShallow((state) =>
      deriveRecentCommitsChromeView(
        state.recentCommitsLimit,
        state.openRecentCommitHashes,
        defaultLimit,
      ),
    ),
  );
}

export function toggleStatusSection(id: StatusSectionId, defaultOpen: boolean): void {
  useStatusTabChromeStore.getState().toggleSection(id, defaultOpen);
}

export function toggleRecentCommit(hash: string): void {
  useStatusTabChromeStore.getState().toggleRecentCommit(hash);
}

export function showMoreRecentCommits(page: number, defaultLimit: number): void {
  useStatusTabChromeStore.getState().showMoreRecentCommits(page, defaultLimit);
}

export function resetStatusTabChrome(): void {
  useStatusTabChromeStore.getState().reset();
}
