// The Cmd-K SEARCH surface (binding figma SearchPalette/List 651:1771 and
// SearchPalette/Expanded 652:1804). It is the search MODE of the one command
// palette (see commandPalette store): the rag-backed semantic search plane that
// surfaces results as SearchResultPills and, on Enter, reveals an on-demand split
// where the cursored result renders full-width in the editorial reader.
//
// Interaction model (binding Figma legends, plain words):
//   List      — ↑↓ move · ↵ open · esc close
//   Expanded  — ↑↓ move · ←→ previous / next · ↵ open · esc close
// Enter from the list reveals the split; Enter in the split opens the result on the
// stage (the engine node-id click-through) and closes the palette; Esc collapses the
// split, then closes.
//
// Layer law (dashboard-layer-ownership / view-rewrite-preserves-the-contract): dumb
// chrome. It consumes the stores `useUnifiedSearchController` (the sole wire client
// for search) and `useContentView` (the sole wire client for node content), derives
// the pill views through the stores `deriveSearchPillViews`, reads degradation only
// through the controller's interpreted `semanticOffline`, and emits selection through
// the scoped dashboard-selection seam. It fetches nothing itself and reads no raw
// `tiers` block. The editorial render REUSES the existing MarkdownReader / CodeViewer
// viewers rather than authoring a bespoke long-form.

import { Search } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useId,
  useMemo,
  useRef,
} from "react";

import {
  closeCommandPalette,
  deriveSearchPaletteKeyboardIntent,
  deriveSearchPalettePresentationView,
  searchPaletteMovedCursor,
  setCommandPaletteQuery,
  setSearchPaletteCursor,
  setSearchPaletteExpanded,
  useCommandPaletteQuery,
  useSearchPaletteCursor,
  useSearchPaletteExpanded,
} from "../../stores/view/commandPalette";
import { useUnifiedSearchController } from "../../stores/server/searchController";
import { deriveSearchPillViews } from "../../stores/server/searchPill";
import { useActiveScope, useContentView } from "../../stores/server/queries";
import { openNodeIsland } from "../../stores/view/selection";
import { Kbd } from "../kit";
import { CodeViewer } from "../viewer/CodeViewer";
import { MarkdownReader } from "../viewer/MarkdownReader";
import { trapTabFocus } from "../chrome/focusTrap";
import { useDismissOnEscape } from "../chrome/useDismissOnEscape";
import { useFocusRestore } from "../chrome/useFocusRestore";
import { SearchResultPill } from "./SearchResultPill";

/** One labelled key-cap group in the footer legend (plain-word labels). */
function LegendHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-fg-1">
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
      <span className="text-caption text-ink-faint">{label}</span>
    </span>
  );
}

export function SearchPaletteSurface() {
  const query = useCommandPaletteQuery();
  const cursor = useSearchPaletteCursor();
  const expanded = useSearchPaletteExpanded();
  const scope = useActiveScope();

  const search = useUnifiedSearchController(query, scope);
  const pills = useMemo(
    () => deriveSearchPillViews(search.results, scope),
    [search.results, scope],
  );
  const presentation = deriveSearchPalettePresentationView({
    query,
    cursor,
    expanded,
    pills,
    searchState: search.state,
    semanticOffline: search.semanticOffline,
    error: search.error,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const listboxId = `${baseId}-results`;
  const liveRegionId = `${baseId}-live`;

  const safeCursor = presentation.safeCursor;
  const selected = pills[safeCursor];
  const selectedNodeId = presentation.selectedNodeId;

  // Fetch the cursored result's content ONLY when the split is revealed (no
  // speculative content fetch while the user is still scanning the list).
  const content = useContentView(
    presentation.showExpandedPanel ? selectedNodeId : null,
    scope,
  );

  const close = useCallback(() => {
    closeCommandPalette();
  }, []);

  useFocusRestore(true, { onOpen: () => inputRef.current?.focus() });

  // Esc collapses the split first, then closes — the two-step escape the Figma
  // expanded legend implies. Window-level so it fires regardless of focus within
  // the panel.
  const onEscape = useCallback(() => {
    if (expanded) {
      setSearchPaletteExpanded(false);
      inputRef.current?.focus();
      return;
    }
    close();
  }, [expanded, close]);
  useDismissOnEscape(onEscape, { enabled: true, preventDefault: true });

  const moveCursor = useCallback(
    (delta: 1 | -1) => {
      if (pills.length === 0) return;
      setSearchPaletteCursor(searchPaletteMovedCursor(pills.length, safeCursor, delta));
    },
    [pills.length, safeCursor],
  );

  const openSelected = useCallback(() => {
    if (!selectedNodeId) return;
    // The ONE standardized open verb (command-palette-planes ADR): a result opens
    // through the canonical selection seam, exactly like the context-menu Open and
    // the graph click-through.
    void openNodeIsland(selectedNodeId, scope).catch(() => undefined);
    close();
  }, [selectedNodeId, scope, close]);

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    const intent = deriveSearchPaletteKeyboardIntent(e.key, expanded);
    if (intent === null) return;
    e.preventDefault();
    if (intent.kind === "move-cursor") moveCursor(intent.delta);
    else if (pills.length === 0) return;
    else if (intent.kind === "reveal-selected") setSearchPaletteExpanded(true);
    else openSelected();
  };

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
        aria-label={presentation.dialogLabel}
        className={presentation.panelClassName}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => trapTabFocus(panelRef.current, e)}
      >
        {/* Query row (figma 651:1772): search glyph · query input · result count. */}
        <div className="flex items-center gap-fg-2 border-b border-rule px-fg-4 py-fg-3">
          <Search aria-hidden className="size-4 shrink-0 text-ink-faint" />
          <input
            ref={inputRef}
            value={query}
            role="combobox"
            aria-expanded={presentation.inputAriaExpanded}
            aria-controls={listboxId}
            aria-autocomplete="list"
            onChange={(e) => {
              setCommandPaletteQuery(e.target.value);
              setSearchPaletteCursor(0);
              setSearchPaletteExpanded(false);
            }}
            onKeyDown={onInputKeyDown}
            placeholder={presentation.inputPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-faint"
          />
          {presentation.resultCountLabel && (
            <span className="shrink-0 text-caption text-ink-faint" data-tabular>
              {presentation.resultCountLabel}
            </span>
          )}
        </div>

        {/* Body: the result list, or — when revealed — the split with the editorial
            render on the right. */}
        {presentation.showExpandedPanel ? (
          <div className="flex min-h-0 flex-1">
            <ul
              id={listboxId}
              role="listbox"
              aria-label={presentation.listboxLabel}
              className="w-[22rem] shrink-0 overflow-y-auto border-r border-rule p-fg-1"
            >
              {pills.map((pill, i) => (
                <li key={pill.key} role="option" aria-selected={i === safeCursor}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setSearchPaletteCursor(i)}
                    className="block w-full text-left"
                  >
                    <SearchResultPill view={pill} selected={i === safeCursor} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              {selected?.species === "code" ? (
                <CodeViewer content={content} />
              ) : selected?.species === "doc" ? (
                <MarkdownReader content={content} scope={scope} />
              ) : (
                <div className="h-full overflow-y-auto p-fg-6">
                  <p className="text-caption font-medium text-ink-faint">
                    {selected?.typeWord}
                  </p>
                  <p className="mt-fg-2 whitespace-pre-wrap text-body text-ink-muted">
                    {selected?.result.rerank_text ??
                      selected?.result.excerpt ??
                      "No preview available."}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <ul
            id={listboxId}
            role="listbox"
            aria-label={presentation.listboxLabel}
            className="max-h-[28rem] min-h-0 flex-1 overflow-y-auto p-fg-1"
          >
            {pills.map((pill, i) => (
              <li key={pill.key} role="option" aria-selected={i === safeCursor}>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => {
                    setSearchPaletteCursor(i);
                    setSearchPaletteExpanded(true);
                  }}
                  className="block w-full text-left"
                >
                  <SearchResultPill view={pill} selected={i === safeCursor} />
                </button>
              </li>
            ))}
            {presentation.emptyMessage && (
              <li
                role="presentation"
                className="px-fg-3 py-fg-4 text-center text-caption text-ink-faint"
              >
                {presentation.emptyMessage}
              </li>
            )}
          </ul>
        )}

        {/* Footer legend (figma 651:1812 / 652 expanded), plain-word labels. */}
        <div className="flex items-center gap-fg-3 border-t border-rule px-fg-4 py-fg-2">
          <LegendHint keys={["↑", "↓"]} label={presentation.footerHints.move} />
          {presentation.showExpandedPanel && (
            <LegendHint
              keys={["←", "→"]}
              label={presentation.footerHints.previousNext}
            />
          )}
          <LegendHint keys={["↵"]} label={presentation.footerHints.open} />
          <LegendHint keys={["esc"]} label={presentation.footerHints.close} />
        </div>

        <div id={liveRegionId} aria-live="polite" className="sr-only">
          {presentation.liveMessage}
        </div>
      </div>
    </div>
  );
}
