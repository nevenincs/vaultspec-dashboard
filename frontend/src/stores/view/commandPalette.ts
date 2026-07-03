import { normalizeSearchCorpus, type SearchCorpus } from "../server/searchProviders";
import { useEffect } from "react";
import { create } from "zustand";

import {
  type KeybindingDef,
  registerKeybindings,
} from "../../platform/keymap/registry";
import { SEARCH_QUERY_MAX_CHARS, normalizeSearchQuery } from "../searchQuery";
import { registerKeyAction } from "./keymapDispatcher";
import { normalizeViewStoreSessionString } from "./scopeIdentity";

export const COMMAND_PALETTE_OPS_MESSAGE_CAP = 240;
export const COMMAND_PALETTE_QUERY_MAX_CHARS = SEARCH_QUERY_MAX_CHARS;
export const COMMAND_PALETTE_ARMED_COMMAND_ID_MAX_CHARS = 512;
export const COMMAND_PALETTE_ACTION_ID = "app:command-palette";
export const COMMAND_PALETTE_SHORTCUT_LABEL = "Open the command palette";
export const COMMAND_PALETTE_KEYBINDING: KeybindingDef = {
  id: COMMAND_PALETTE_ACTION_ID,
  defaultChord: "Mod+K",
  label: COMMAND_PALETTE_SHORTCUT_LABEL,
  group: "General",
  context: "global",
};

// The Cmd-K palette has THREE planes (command-palette-planes / search-providers
// ADRs), all modes of the one overlay so "Command-K controls searching" holds:
//   `command`  — the verb/navigation plane fed by the command-provider registry.
//   `search`   — the one Search plane composing three providers (meaning + files by
//                name, vault + code) into one ranked interleaved list, with the
//                on-demand expanded reader split (figma SearchPalette 651:1771 / 652:1804).
//   `document` — the LITERAL document finder, a thin consumer of the files(vault)
//                provider over the structural-tier vault tree, for "where is the
//                thing named X". Stays available when the meaning source is offline.
export type CommandPaletteMode = "command" | "search" | "document";

export const SEARCH_PALETTE_ACTION_ID = "app:search";
export const SEARCH_PALETTE_SHORTCUT_LABEL = "Search documents and code";
export const SEARCH_PALETTE_KEYBINDING: KeybindingDef = {
  id: SEARCH_PALETTE_ACTION_ID,
  defaultChord: "Mod+P",
  label: SEARCH_PALETTE_SHORTCUT_LABEL,
  group: "General",
  context: "global",
};

export const DOCUMENT_SEARCH_ACTION_ID = "app:document-search";
export const DOCUMENT_SEARCH_SHORTCUT_LABEL = "Go to document by name";
export const DOCUMENT_SEARCH_KEYBINDING: KeybindingDef = {
  id: DOCUMENT_SEARCH_ACTION_ID,
  defaultChord: "Mod+Shift+O",
  label: DOCUMENT_SEARCH_SHORTCUT_LABEL,
  group: "General",
  context: "global",
};

export function normalizeCommandPaletteMode(mode: unknown): CommandPaletteMode {
  if (mode === "search") return "search";
  if (mode === "document") return "document";
  return "command";
}

export function normalizeSearchPaletteCursor(cursor: unknown): number {
  return typeof cursor === "number" && Number.isFinite(cursor)
    ? Math.max(0, Math.trunc(cursor))
    : 0;
}

export function normalizeSearchPaletteExpanded(expanded: unknown): boolean {
  return expanded === true;
}

/** The non-typical render mode when there are no result pills (state-mode-uniformity
 *  ADR): `loading` → a UI-only Skeleton (the message is the screen-reader label only),
 *  `degraded`/`empty` → a StateBlock (shared glyph + one sentence). `null` means there
 *  is no empty state to render (results are present). */
export type SearchPaletteStateMode = "loading" | "degraded" | "empty" | null;

export interface SearchPalettePresentationView {
  safeCursor: number;
  selectedNodeId: string | null;
  showExpandedPanel: boolean;
  dialogLabel: string;
  inputPlaceholder: string;
  inputAriaExpanded: boolean;
  resultCountLabel: string;
  listboxLabel: string;
  panelClassName: string;
  /** The non-typical state mode to render when there are no pills (see above). */
  stateMode: SearchPaletteStateMode;
  emptyMessage: string | null;
  liveMessage: string;
  /** A one-line footer note when a provider's listing was walk-capped, so name
   *  matches may be missing files (search-providers ADR D1 / D8); null otherwise.
   *  Rendered visibly AND in the live region (twin parity). */
  incompleteNote: string | null;
  footerHints: {
    move: string;
    previousNext: string;
    open: string;
    close: string;
  };
}

export type SearchPaletteKeyboardIntent =
  | { kind: "move-cursor"; delta: 1 | -1 }
  | { kind: "reveal-selected" }
  | { kind: "open-selected" };

export interface SearchPalettePillShape {
  nodeId?: string | null;
}

export function searchPaletteMovedCursor(
  length: number,
  cursor: unknown,
  delta: 1 | -1,
): number {
  if (length <= 0) return 0;
  const current = normalizeSearchPaletteCursor(cursor);
  return (current + delta + length) % length;
}

export function deriveSearchPaletteKeyboardIntent(
  key: unknown,
  expanded: unknown,
): SearchPaletteKeyboardIntent | null {
  const isExpanded = normalizeSearchPaletteExpanded(expanded);
  if (key === "ArrowDown") return { kind: "move-cursor", delta: 1 };
  if (key === "ArrowUp") return { kind: "move-cursor", delta: -1 };
  if (isExpanded && key === "ArrowRight") return { kind: "move-cursor", delta: 1 };
  if (isExpanded && key === "ArrowLeft") return { kind: "move-cursor", delta: -1 };
  if (key === "Enter") {
    return isExpanded ? { kind: "open-selected" } : { kind: "reveal-selected" };
  }
  return null;
}

export function deriveSearchPalettePresentationView(context: {
  query: unknown;
  cursor: unknown;
  expanded: unknown;
  pills: readonly SearchPalettePillShape[];
  searchState: unknown;
  semanticOffline: unknown;
  error: unknown;
  incomplete?: unknown;
}): SearchPalettePresentationView {
  const query = normalizeCommandPaletteQuery(context.query);
  const expanded = normalizeSearchPaletteExpanded(context.expanded);
  const cursor = normalizeSearchPaletteCursor(context.cursor);
  const count = context.pills.length;
  const safeCursor = count > 0 ? Math.min(cursor, count - 1) : 0;
  const selectedNodeId = context.pills[safeCursor]?.nodeId ?? null;
  const resultCountLabel =
    count > 0
      ? `${count} result${count === 1 ? "" : "s"}`
      : context.searchState === "loading"
        ? "searching…"
        : "";
  // The empty/idle PROMPT (no query yet) stays a plain hint sentence — it is the
  // typical idle state, not an empty/degraded result. Loading, degraded, and no-match
  // are routed to the shared state-mode kit via `stateMode`; their sentence travels as
  // the StateBlock message (or the Skeleton's screen-reader label for loading).
  const stateMode: SearchPaletteStateMode =
    count > 0 || query.length === 0
      ? null
      : context.searchState === "loading"
        ? "loading"
        : context.semanticOffline === true
          ? "degraded"
          : "empty";
  const emptyMessage =
    count > 0
      ? null
      : query.length === 0
        ? "Search across your documents and code."
        : context.searchState === "loading"
          ? "Searching documents and code"
          : context.semanticOffline === true
            ? "Full search is unavailable — showing name matches only."
            : `No matches for “${query}”.`;

  // A walk-capped provider listing: the name matches may be missing files. One
  // plain-language line, no mechanism words (search-providers ADR D1 / D8).
  // Gated on an active query — at idle no matches are shown yet, so announcing
  // missing matches would be premature.
  const incompleteNote =
    context.incomplete === true && query.length > 0
      ? "Some files may be missing from name matches — the repository is very large."
      : null;

  return {
    safeCursor,
    selectedNodeId,
    showExpandedPanel: expanded && count > 0,
    dialogLabel: "Search documents and code",
    inputPlaceholder: "Search documents and code…",
    inputAriaExpanded: true,
    resultCountLabel,
    listboxLabel: "search results",
    panelClassName: `flex max-h-[calc(100vh-9rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-fg-lg border border-rule bg-paper-raised shadow-fg-popover animate-slide-in-down ${
      expanded ? "w-[64rem]" : "w-[32rem]"
    }`,
    stateMode,
    emptyMessage,
    // Screen-reader twin parity (search-providers ADR D3): the degraded sentence
    // is announced ONLY when it is also the VISIBLE state (no results); once files
    // rescue with results the SR announces the normal count message, matching the
    // visible list instead of stranding a degraded copy with no on-screen twin.
    liveMessage:
      context.error === true
        ? "search request failed"
        : count === 0 && context.semanticOffline === true
          ? "Full search is unavailable — showing name matches only."
          : resultCountLabel,
    incompleteNote,
    footerHints: {
      move: "move",
      previousNext: "previous / next",
      open: "open",
      close: "close",
    },
  };
}

export function normalizeCommandPaletteOpsMessage(message: unknown): string | null {
  if (typeof message !== "string") return null;
  const trimmed = message.trim();
  if (!trimmed) return null;
  return trimmed.length > COMMAND_PALETTE_OPS_MESSAGE_CAP
    ? `${trimmed.slice(0, COMMAND_PALETTE_OPS_MESSAGE_CAP - 1)}…`
    : trimmed;
}

export function normalizeCommandPaletteQuery(query: unknown): string {
  return normalizeSearchQuery(query);
}

export function normalizeCommandPaletteCursor(cursor: unknown): number {
  return typeof cursor === "number" && Number.isFinite(cursor)
    ? Math.max(0, Math.trunc(cursor))
    : 0;
}

export function normalizeCommandPaletteArmedCommandId(
  commandId: unknown,
): string | null {
  if (typeof commandId !== "string") return null;
  const normalized = commandId.trim();
  return normalized.length > 0 &&
    normalized.length <= COMMAND_PALETTE_ARMED_COMMAND_ID_MAX_CHARS
    ? normalized
    : null;
}

export function normalizeCommandPaletteOpsEpoch(epoch: unknown): number | null {
  return typeof epoch === "number" && Number.isSafeInteger(epoch) && epoch >= 0
    ? epoch
    : null;
}

function nextCommandPaletteOpsEpoch(epoch: unknown): number {
  return (normalizeCommandPaletteOpsEpoch(epoch) ?? 0) + 1;
}

export const normalizeCommandPaletteFeedbackScope = normalizeViewStoreSessionString;

export function normalizeCommandPaletteFeedbackTimeTravel(value: unknown): boolean {
  return value === true;
}

export function canResetCommandPaletteFeedbackBoundary(scope: unknown): boolean {
  return scope === null || normalizeCommandPaletteFeedbackScope(scope) !== null;
}

interface CommandPaletteState {
  open: boolean;
  mode: CommandPaletteMode;
  query: string;
  cursor: number;
  /** Search mode: the selected result-row index (the cursored pill). */
  searchCursor: number;
  /** Search mode: whether the on-demand reader split is revealed. */
  searchExpanded: boolean;
  /** Search mode: the corpus separation control (all | docs | code). */
  searchCorpus: SearchCorpus;
  armedCommandId: string | null;
  opsMessage: string | null;
  opsEpoch: number;
  openPalette: () => void;
  openSearch: () => void;
  openDocument: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  setMode: (mode: unknown) => void;
  setQuery: (query: unknown) => void;
  setCursor: (cursor: unknown) => void;
  setSearchCursor: (cursor: unknown) => void;
  setSearchExpanded: (expanded: unknown) => void;
  setSearchCorpus: (corpus: unknown) => void;
  setArmedCommandId: (commandId: unknown) => void;
  resetSurfaceState: () => void;
  resetOpsFeedback: () => void;
  beginOpsFeedback: (message: unknown) => number;
  setOpsFeedbackForEpoch: (epoch: unknown, message: unknown) => void;
  reset: () => void;
}

export interface CommandPaletteSurfaceState {
  open: boolean;
  query: string;
  cursor: number;
  armedCommandId: string | null;
  opsMessage: string | null;
  opsEpoch: number;
}

export function normalizeCommandPaletteOpen(open: unknown): boolean {
  return open === true;
}

export function normalizeCommandPaletteSurfaceState(
  state: unknown,
): CommandPaletteSurfaceState {
  const value =
    state !== null && typeof state === "object"
      ? (state as Partial<Record<keyof CommandPaletteSurfaceState, unknown>>)
      : {};
  return {
    open: normalizeCommandPaletteOpen(value.open),
    query: normalizeCommandPaletteQuery(value.query),
    cursor: normalizeCommandPaletteCursor(value.cursor),
    armedCommandId: normalizeCommandPaletteArmedCommandId(value.armedCommandId),
    opsMessage: normalizeCommandPaletteOpsMessage(value.opsMessage),
    opsEpoch: normalizeCommandPaletteOpsEpoch(value.opsEpoch) ?? 0,
  };
}

export const useCommandPaletteStore = create<CommandPaletteState>((set, get) => ({
  open: false,
  mode: "command",
  query: "",
  cursor: 0,
  searchCursor: 0,
  searchExpanded: false,
  searchCorpus: "all",
  armedCommandId: null,
  opsMessage: null,
  opsEpoch: 0,
  openPalette: () =>
    set((state) => {
      const current = normalizeCommandPaletteSurfaceState(state);
      return {
        open: true,
        mode: "command",
        query: "",
        cursor: 0,
        searchCursor: 0,
        searchExpanded: false,
        searchCorpus: "all",
        armedCommandId: null,
        opsMessage: null,
        opsEpoch: nextCommandPaletteOpsEpoch(current.opsEpoch),
      };
    }),
  openSearch: () =>
    set((state) => {
      const current = normalizeCommandPaletteSurfaceState(state);
      return {
        open: true,
        mode: "search",
        query: "",
        cursor: 0,
        searchCursor: 0,
        searchExpanded: false,
        searchCorpus: "all",
        armedCommandId: null,
        opsMessage: null,
        opsEpoch: nextCommandPaletteOpsEpoch(current.opsEpoch),
      };
    }),
  openDocument: () =>
    set((state) => {
      const current = normalizeCommandPaletteSurfaceState(state);
      return {
        open: true,
        mode: "document",
        query: "",
        cursor: 0,
        searchCursor: 0,
        searchExpanded: false,
        searchCorpus: "all",
        armedCommandId: null,
        opsMessage: null,
        opsEpoch: nextCommandPaletteOpsEpoch(current.opsEpoch),
      };
    }),
  closePalette: () =>
    set((state) => {
      const current = normalizeCommandPaletteSurfaceState(state);
      return {
        open: false,
        mode: "command",
        query: "",
        cursor: 0,
        searchCursor: 0,
        searchExpanded: false,
        searchCorpus: "all",
        armedCommandId: null,
        opsMessage: null,
        opsEpoch: nextCommandPaletteOpsEpoch(current.opsEpoch),
      };
    }),
  togglePalette: () =>
    set((state) => {
      const current = normalizeCommandPaletteSurfaceState(state);
      return {
        open: !current.open,
        mode: "command",
        query: "",
        cursor: 0,
        searchCursor: 0,
        searchExpanded: false,
        searchCorpus: "all",
        armedCommandId: null,
        opsMessage: null,
        opsEpoch: nextCommandPaletteOpsEpoch(current.opsEpoch),
      };
    }),
  setMode: (mode) => set({ mode: normalizeCommandPaletteMode(mode) }),
  setQuery: (query) => set({ query: normalizeCommandPaletteQuery(query) }),
  setCursor: (cursor) => set({ cursor: normalizeCommandPaletteCursor(cursor) }),
  setSearchCursor: (cursor) =>
    set({ searchCursor: normalizeSearchPaletteCursor(cursor) }),
  setSearchExpanded: (expanded) =>
    set({ searchExpanded: normalizeSearchPaletteExpanded(expanded) }),
  // A corpus switch re-ranks the list, so the cursor restarts at the top.
  setSearchCorpus: (corpus) =>
    set({ searchCorpus: normalizeSearchCorpus(corpus), searchCursor: 0 }),
  setArmedCommandId: (commandId) =>
    set({ armedCommandId: normalizeCommandPaletteArmedCommandId(commandId) }),
  resetSurfaceState: () =>
    set({
      query: "",
      cursor: 0,
      searchCursor: 0,
      searchExpanded: false,
      searchCorpus: "all",
      armedCommandId: null,
    }),
  resetOpsFeedback: () =>
    set((state) => ({
      opsMessage: null,
      opsEpoch: nextCommandPaletteOpsEpoch(state.opsEpoch),
    })),
  beginOpsFeedback: (message) => {
    const epoch = nextCommandPaletteOpsEpoch(get().opsEpoch);
    set({
      opsMessage: normalizeCommandPaletteOpsMessage(message),
      opsEpoch: epoch,
    });
    return epoch;
  },
  setOpsFeedbackForEpoch: (epoch, message) =>
    set((state) => {
      const normalizedEpoch = normalizeCommandPaletteOpsEpoch(epoch);
      const normalizedMessage = normalizeCommandPaletteOpsMessage(message);
      return state.open &&
        normalizedEpoch !== null &&
        normalizedMessage !== null &&
        state.opsEpoch === normalizedEpoch
        ? { opsMessage: normalizedMessage }
        : state;
    }),
  reset: () =>
    set((state) => {
      const current = normalizeCommandPaletteSurfaceState(state);
      return {
        open: false,
        mode: "command",
        query: "",
        cursor: 0,
        searchCursor: 0,
        searchExpanded: false,
        searchCorpus: "all",
        armedCommandId: null,
        opsMessage: null,
        opsEpoch: nextCommandPaletteOpsEpoch(current.opsEpoch),
      };
    }),
}));

export function useCommandPaletteOpen(): boolean {
  return useCommandPaletteStore((state) => normalizeCommandPaletteOpen(state.open));
}

export function useCommandPaletteOpsMessage(): string | null {
  return useCommandPaletteStore((state) =>
    normalizeCommandPaletteOpsMessage(state.opsMessage),
  );
}

export function useCommandPaletteMode(): CommandPaletteMode {
  return useCommandPaletteStore((state) => normalizeCommandPaletteMode(state.mode));
}

export function useSearchPaletteCursor(): number {
  return useCommandPaletteStore((state) =>
    normalizeSearchPaletteCursor(state.searchCursor),
  );
}

export function useSearchPaletteExpanded(): boolean {
  return useCommandPaletteStore((state) =>
    normalizeSearchPaletteExpanded(state.searchExpanded),
  );
}

export function useSearchPaletteCorpus(): SearchCorpus {
  return useCommandPaletteStore((state) => normalizeSearchCorpus(state.searchCorpus));
}

export function useCommandPaletteQuery(): string {
  return useCommandPaletteStore((state) => normalizeCommandPaletteQuery(state.query));
}

export function useCommandPaletteCursor(): number {
  return useCommandPaletteStore((state) => normalizeCommandPaletteCursor(state.cursor));
}

export function useCommandPaletteArmedCommandId(): string | null {
  return useCommandPaletteStore((state) =>
    normalizeCommandPaletteArmedCommandId(state.armedCommandId),
  );
}

export function openCommandPalette(): void {
  useCommandPaletteStore.getState().openPalette();
}

export function openSearchPalette(): void {
  useCommandPaletteStore.getState().openSearch();
}

export function openDocumentSearchPalette(): void {
  useCommandPaletteStore.getState().openDocument();
}

export function closeCommandPalette(): void {
  useCommandPaletteStore.getState().closePalette();
}

export function setCommandPaletteMode(mode: unknown): void {
  useCommandPaletteStore.getState().setMode(mode);
}

export function setSearchPaletteCursor(cursor: unknown): void {
  useCommandPaletteStore.getState().setSearchCursor(cursor);
}

export function setSearchPaletteExpanded(expanded: unknown): void {
  useCommandPaletteStore.getState().setSearchExpanded(expanded);
}

export function setSearchPaletteCorpus(corpus: unknown): void {
  useCommandPaletteStore.getState().setSearchCorpus(corpus);
}

export function toggleCommandPalette(): void {
  useCommandPaletteStore.getState().togglePalette();
}

export function setCommandPaletteQuery(query: unknown): void {
  useCommandPaletteStore.getState().setQuery(query);
}

export function setCommandPaletteCursor(cursor: unknown): void {
  useCommandPaletteStore.getState().setCursor(cursor);
}

export function setCommandPaletteArmedCommandId(commandId: unknown): void {
  useCommandPaletteStore.getState().setArmedCommandId(commandId);
}

export function resetCommandPaletteSurfaceState(): void {
  useCommandPaletteStore.getState().resetSurfaceState();
}

export function resetCommandPaletteOpsFeedback(): void {
  useCommandPaletteStore.getState().resetOpsFeedback();
}

export function beginCommandPaletteOpsFeedback(message: unknown): number {
  return useCommandPaletteStore.getState().beginOpsFeedback(message);
}

export function setCommandPaletteOpsFeedbackForEpoch(
  epoch: unknown,
  message: unknown,
): void {
  useCommandPaletteStore.getState().setOpsFeedbackForEpoch(epoch, message);
}

export function resetCommandPalette(): void {
  useCommandPaletteStore.getState().reset();
}

export function useCommandPaletteGlobalToggle(cancelConfirm: () => void): void {
  const open = useCommandPaletteOpen();
  useEffect(() => {
    const disposeBinding = registerKeybindings([COMMAND_PALETTE_KEYBINDING]);
    const disposeAction = registerKeyAction(COMMAND_PALETTE_ACTION_ID, () => ({
      id: COMMAND_PALETTE_ACTION_ID,
      label: COMMAND_PALETTE_SHORTCUT_LABEL,
      run: () => {
        cancelConfirm();
        resetCommandPaletteOpsFeedback();
        if (open) {
          closeCommandPalette();
          return;
        }
        openCommandPalette();
      },
    }));
    return () => {
      disposeAction();
      disposeBinding();
    };
  }, [cancelConfirm, open]);
}

/**
 * Register the global search shortcut (`app:search`, default `Mod+P`) on the one
 * keymap registry + dispatcher (keyboard-shortcuts-bind-through-the-one-keymap-
 * registry). It opens the palette directly in search mode (or, when the palette is
 * already in search mode, toggles it closed); pressing it from command mode flips
 * the open palette into search mode. Mirrors `useCommandPaletteGlobalToggle`.
 */
export function useSearchPaletteGlobalShortcut(cancelConfirm: () => void): void {
  const open = useCommandPaletteOpen();
  const mode = useCommandPaletteMode();
  useEffect(() => {
    const disposeBinding = registerKeybindings([SEARCH_PALETTE_KEYBINDING]);
    const disposeAction = registerKeyAction(SEARCH_PALETTE_ACTION_ID, () => ({
      id: SEARCH_PALETTE_ACTION_ID,
      label: SEARCH_PALETTE_SHORTCUT_LABEL,
      run: () => {
        cancelConfirm();
        resetCommandPaletteOpsFeedback();
        if (open && mode === "search") {
          closeCommandPalette();
          return;
        }
        openSearchPalette();
      },
    }));
    return () => {
      disposeAction();
      disposeBinding();
    };
  }, [cancelConfirm, open, mode]);
}

/**
 * Register the global document-search shortcut (`app:document-search`, default
 * `Mod+Shift+O`) on the one keymap registry + dispatcher. It opens the palette in the
 * literal document-finder plane (or toggles it closed when already there), mirroring
 * `useSearchPaletteGlobalShortcut`.
 */
export function useDocumentSearchGlobalShortcut(cancelConfirm: () => void): void {
  const open = useCommandPaletteOpen();
  const mode = useCommandPaletteMode();
  useEffect(() => {
    const disposeBinding = registerKeybindings([DOCUMENT_SEARCH_KEYBINDING]);
    const disposeAction = registerKeyAction(DOCUMENT_SEARCH_ACTION_ID, () => ({
      id: DOCUMENT_SEARCH_ACTION_ID,
      label: DOCUMENT_SEARCH_SHORTCUT_LABEL,
      run: () => {
        cancelConfirm();
        resetCommandPaletteOpsFeedback();
        if (open && mode === "document") {
          closeCommandPalette();
          return;
        }
        openDocumentSearchPalette();
      },
    }));
    return () => {
      disposeAction();
      disposeBinding();
    };
  }, [cancelConfirm, open, mode]);
}

/**
 * Reset transient command-palette operation feedback when its validity context
 * changes. The feedback line describes one op outcome in one corpus/mode; a
 * scope swap or live/time-travel transition must also bump the epoch so late
 * callbacks cannot resurrect stale text.
 */
export function useCommandPaletteOpsFeedbackBoundary(
  scope: unknown,
  timeTravel: unknown,
): void {
  const normalizedScope = normalizeCommandPaletteFeedbackScope(scope);
  const normalizedTimeTravel = normalizeCommandPaletteFeedbackTimeTravel(timeTravel);
  const canReset = canResetCommandPaletteFeedbackBoundary(scope);
  useEffect(() => {
    if (!canReset) return;
    resetCommandPaletteOpsFeedback();
  }, [canReset, normalizedScope, normalizedTimeTravel]);
}
