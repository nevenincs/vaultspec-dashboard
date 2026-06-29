// The Cmd-K DOCUMENT-SEARCH surface (command-palette-planes ADR, W02.P06): the
// literal "go to document by name" plane of the one command palette. It is the
// rag-free sibling of the semantic SearchPaletteSurface — a flat result list with no
// expanded reader split — backed by the structural-tier vault tree, so it stays
// available when the semantic tier is offline.
//
// Layer law (dashboard-layer-ownership): dumb chrome. It consumes the stores
// `useDocumentSearchController` (which owns the only wire access — the vault tree),
// derives pill views through the shared `deriveSearchPillViews`, and opens a result
// through the ONE standardized open seam (`openNodeIsland`), exactly like the
// semantic surface and the context-menu Open. It fetches nothing itself and reads no
// raw `tiers` block.

import { FileText } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useId,
  useMemo,
  useRef,
} from "react";

import {
  closeCommandPalette,
  searchPaletteMovedCursor,
  setCommandPaletteQuery,
  setSearchPaletteCursor,
  useCommandPaletteQuery,
  useSearchPaletteCursor,
} from "../../stores/view/commandPalette";
import { useDocumentSearchController } from "../../stores/server/documentSearchController";
import { deriveSearchPillViews } from "../../stores/server/searchPill";
import { useActiveScope } from "../../stores/server/queries";
import { activateEntity } from "../../stores/view/activateEntity";
import { Skeleton, SkeletonRow, StateBlock } from "../kit";
import { trapTabFocus } from "../chrome/focusTrap";
import { useDismissOnEscape } from "../chrome/useDismissOnEscape";
import { useFocusRestore } from "../chrome/useFocusRestore";
import { SearchResultPill } from "./SearchResultPill";

export function DocumentSearchSurface() {
  const query = useCommandPaletteQuery();
  const cursor = useSearchPaletteCursor();
  const scope = useActiveScope();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { results, state, count } = useDocumentSearchController(query, scope);
  const pills = useMemo(() => deriveSearchPillViews(results, scope), [results, scope]);
  const safeCursor = pills.length > 0 ? Math.min(cursor, pills.length - 1) : 0;
  const selectedNodeId = pills[safeCursor]?.nodeId ?? null;

  const close = useCallback(() => closeCommandPalette(), []);
  useFocusRestore(true, { onOpen: () => inputRef.current?.focus() });
  useDismissOnEscape(close, { enabled: true, preventDefault: true });

  const moveCursor = useCallback(
    (delta: 1 | -1) => {
      if (pills.length === 0) return;
      setSearchPaletteCursor(searchPaletteMovedCursor(pills.length, safeCursor, delta));
    },
    [pills.length, safeCursor],
  );

  const openNode = useCallback(
    (nodeId: string | null) => {
      if (!nodeId) return;
      // Off-canvas open (search) → the ONE canonical activate seam: PERMANENT dock tab
      // + frame:true so the graph MATERIALIZES and CENTERS on the node (it may be off
      // the current constellation slice). Retires the dead island open.
      void activateEntity(nodeId, scope, { permanent: true, frame: true }).catch(
        () => undefined,
      );
      close();
    },
    [scope, close],
  );

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveCursor(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveCursor(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      openNode(selectedNodeId);
    }
  };

  const countLabel =
    count > 0
      ? `${count} document${count === 1 ? "" : "s"}`
      : state === "loading"
        ? "searching…"
        : "";
  // The idle PROMPT (no query yet) stays a plain hint sentence — it is the typical idle
  // state, not an empty/degraded result. Loading, degraded, and no-match render through
  // the shared state-mode kit (state-mode-uniformity ADR): loading is a UI-only Skeleton
  // (its sentence is the screen-reader label, never visible text); degraded/empty are a
  // StateBlock (shared glyph + one plain sentence).
  const idlePrompt =
    count === 0 && query.trim().length === 0 ? "Find a document by name." : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 pt-24 animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Go to document by name"
        className="flex max-h-[calc(100vh-9rem)] w-[32rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-fg-lg border border-rule bg-paper-raised shadow-fg-popover animate-slide-in-down"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => trapTabFocus(panelRef.current, e)}
      >
        <div className="flex items-center gap-fg-2 border-b border-rule px-fg-4 py-fg-3">
          <FileText aria-hidden className="size-4 shrink-0 text-ink-faint" />
          <input
            ref={inputRef}
            value={query}
            role="combobox"
            aria-expanded
            aria-controls={listboxId}
            aria-autocomplete="list"
            onChange={(e) => {
              setCommandPaletteQuery(e.target.value);
              setSearchPaletteCursor(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Go to document by name…"
            className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-faint"
          />
          {countLabel && (
            <span className="shrink-0 text-caption text-ink-faint" data-tabular>
              {countLabel}
            </span>
          )}
        </div>

        {count > 0 ? (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="documents"
            className="min-h-0 flex-1 overflow-y-auto p-fg-1"
          >
            {pills.map((pill, i) => (
              <li key={pill.key} role="option" aria-selected={i === safeCursor}>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => {
                    setSearchPaletteCursor(i);
                    openNode(pill.nodeId);
                  }}
                  className="block w-full text-left"
                >
                  <SearchResultPill view={pill} selected={i === safeCursor} />
                </button>
              </li>
            ))}
          </ul>
        ) : idlePrompt ? (
          <div className="px-fg-4 py-fg-6 text-caption text-ink-faint">
            {idlePrompt}
          </div>
        ) : state === "loading" ? (
          <Skeleton label="Searching documents" className="p-fg-1">
            <SkeletonRow width="w-2/3" />
            <SkeletonRow width="w-1/2" />
            <SkeletonRow width="w-3/5" />
          </Skeleton>
        ) : state === "degraded" ? (
          <StateBlock
            mode="degraded"
            message="Documents are temporarily unavailable."
          />
        ) : (
          <StateBlock mode="empty" message="No document matches your search." />
        )}
      </div>
    </div>
  );
}
