// Search across available document and code providers with an optional preview.

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
  setSearchPaletteCorpus,
  setSearchPaletteExpanded,
  useCommandPaletteQuery,
  useSearchPaletteCorpus,
  useSearchPaletteCursor,
  useSearchPaletteExpanded,
} from "../../stores/view/commandPalette";
import {
  type SearchCorpus,
  useSearchProviders,
} from "../../stores/server/searchProviders";
import { deriveSearchPillViewsFromProviderEntries } from "../../stores/server/searchPill";
import { useActiveScope, useContentView } from "../../stores/server/queries";
import { activateEntity } from "../../stores/view/activateEntity";
import { useViewportClass } from "../../stores/view/viewportClass";
import {
  Kbd,
  Segment,
  SegmentedToggle,
  Skeleton,
  SkeletonRow,
  StateBlock,
} from "../kit";
import { CodeViewer } from "../viewer/CodeViewer";
import { MarkdownReader } from "../viewer/MarkdownReader";
import { trapTabFocus } from "../chrome/focusTrap";
import { useDismissOnEscape } from "../chrome/useDismissOnEscape";
import { useFocusRestore } from "../chrome/useFocusRestore";
import { SearchResultPill } from "./SearchResultPill";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { AnyMessageDescriptor } from "../../platform/localization/message";

const SEARCH_SURFACE_MESSAGES = {
  cancel: { key: "common:searchPalette.actions.cancel" },
  scope: { key: "common:searchPalette.accessibility.scope" },
  all: { key: "common:searchPalette.scopes.all" },
  documents: { key: "common:searchPalette.scopes.documents" },
  code: { key: "common:searchPalette.scopes.code" },
  previewUnavailable: { key: "common:searchPalette.preview.unavailable" },
} as const;

/** Loading uses a skeleton while other empty states use a shared state block. The
 *  sentence is the screen-reader label, never visible text); degraded/empty render a
 *  StateBlock (shared glyph + one plain sentence); the idle prompt (stateMode `null`
 *  with a message) stays a plain hint sentence. Returns `null` when there is nothing to
 *  show. */
function SearchEmptyState({
  stateMode,
  message,
}: {
  stateMode: "loading" | "degraded" | "error" | "empty" | null;
  message: string | null;
}) {
  if (stateMode === "loading") {
    return (
      <Skeleton label={message ?? ""} className="p-fg-1">
        <SkeletonRow width="w-2/3" />
        <SkeletonRow width="w-1/2" />
        <SkeletonRow width="w-3/5" />
      </Skeleton>
    );
  }
  if (stateMode === "degraded" || stateMode === "error") {
    return <StateBlock mode="degraded" message={message ?? ""} />;
  }
  if (stateMode === "empty") {
    return <StateBlock mode="empty" message={message ?? ""} />;
  }
  if (message) {
    return (
      <div className="px-fg-3 py-fg-6 text-center text-caption text-ink-muted">
        {message}
      </div>
    );
  }
  return null;
}

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

/** The corpus separation control (search-providers corpus seam): one three-way
 *  segmented radiogroup — All | Docs | Code — narrowing which providers feed the
 *  merged list. A search-target control on the search plane, never a corpus
 *  filter write. */
function CorpusToggle({ corpus }: { corpus: SearchCorpus }) {
  const resolveMessage = useLocalizedMessageResolver();
  const message = (descriptor: AnyMessageDescriptor) =>
    resolveMessage(descriptor).message;
  return (
    <SegmentedToggle
      value={corpus}
      onChange={(value) => setSearchPaletteCorpus(value)}
      ariaLabel={message(SEARCH_SURFACE_MESSAGES.scope)}
    >
      <Segment value="all">{message(SEARCH_SURFACE_MESSAGES.all)}</Segment>
      <Segment value="docs">{message(SEARCH_SURFACE_MESSAGES.documents)}</Segment>
      <Segment value="code">{message(SEARCH_SURFACE_MESSAGES.code)}</Segment>
    </SegmentedToggle>
  );
}

export function SearchPaletteSurface() {
  const resolveMessage = useLocalizedMessageResolver();
  const message = (descriptor: AnyMessageDescriptor) =>
    resolveMessage(descriptor).message;
  const query = useCommandPaletteQuery();
  const cursor = useSearchPaletteCursor();
  const expanded = useSearchPaletteExpanded();
  const corpus = useSearchPaletteCorpus();
  const scope = useActiveScope();

  const search = useSearchProviders(query, scope, corpus);
  const pills = useMemo(
    () => deriveSearchPillViewsFromProviderEntries(search.entries, scope),
    [search.entries, scope],
  );
  const presentation = deriveSearchPalettePresentationView({
    query,
    cursor,
    expanded,
    pills,
    searchState: search.state,
    semanticOffline: search.semanticOffline,
    error: search.error,
    incomplete: search.incomplete,
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

  // Escape closes the preview before it closes the search surface.
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
    void activateEntity(selectedNodeId, scope, {
      permanent: true,
      frame: true,
    }).catch(() => undefined);
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

  // Compact layouts use a full-screen result list without the preview split.
  const compact = useViewportClass() === "compact";
  if (compact) {
    return (
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={message(presentation.dialogLabel)}
        className="fixed inset-0 z-50 flex flex-col bg-paper animate-fade-in"
        onKeyDown={(e) => trapTabFocus(panelRef.current, e)}
      >
        <div className="flex items-center gap-fg-2 border-b border-rule px-fg-3 py-fg-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
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
            placeholder={message(presentation.inputPlaceholder)}
            className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-faint"
          />
          <button
            type="button"
            onClick={close}
            className="shrink-0 rounded-fg-sm px-fg-2 py-fg-1 text-body-strong text-accent-text"
          >
            {message(SEARCH_SURFACE_MESSAGES.cancel)}
          </button>
        </div>
        <div className="flex items-center border-b border-rule px-fg-3 py-fg-1-5">
          <CorpusToggle corpus={corpus} />
        </div>
        {pills.length > 0 ? (
          <ul
            id={listboxId}
            role="listbox"
            aria-label={message(presentation.listboxLabel)}
            className="min-h-0 flex-1 overflow-y-auto p-fg-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          >
            {pills.map((pill, i) => (
              <li key={pill.key} role="option" aria-selected={i === safeCursor}>
                <button
                  type="button"
                  disabled={!pill.selectable}
                  onClick={() => {
                    if (!pill.nodeId) return;
                    void activateEntity(pill.nodeId, scope, {
                      permanent: true,
                      frame: true,
                    }).catch(() => undefined);
                    close();
                  }}
                  className="block w-full text-left"
                >
                  <SearchResultPill view={pill} selected={false} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-fg-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <SearchEmptyState
              stateMode={presentation.stateMode}
              message={
                presentation.emptyMessage ? message(presentation.emptyMessage) : null
              }
            />
          </div>
        )}
        {presentation.incompleteNote && (
          <div className="border-t border-rule px-fg-3 py-fg-1 text-caption text-ink-muted">
            {message(presentation.incompleteNote)}
          </div>
        )}
        <div id={liveRegionId} aria-live="polite" className="sr-only">
          {presentation.liveMessage ? message(presentation.liveMessage) : ""}
        </div>
      </div>
    );
  }

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
        aria-label={message(presentation.dialogLabel)}
        className={presentation.panelClassName}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => trapTabFocus(panelRef.current, e)}
      >
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
            placeholder={message(presentation.inputPlaceholder)}
            className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-faint"
          />
          <CorpusToggle corpus={corpus} />
          {presentation.resultCountLabel && (
            <span className="shrink-0 text-caption text-ink-muted" data-tabular>
              {message(presentation.resultCountLabel)}
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
              aria-label={message(presentation.listboxLabel)}
              className="w-[22rem] shrink-0 overflow-y-auto border-r border-rule p-fg-1"
            >
              {pills.map((pill, i) => (
                <li key={pill.key} role="option" aria-selected={i === safeCursor}>
                  <button
                    type="button"
                    disabled={!pill.selectable}
                    tabIndex={-1}
                    onClick={() => {
                      if (!pill.selectable) return;
                      setSearchPaletteCursor(i);
                    }}
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
                  <p className="text-caption font-medium text-ink-muted">
                    {selected ? message(selected.typeWord) : ""}
                  </p>
                  <p className="mt-fg-2 whitespace-pre-wrap text-body text-ink-muted">
                    {selected?.preview ??
                      message(SEARCH_SURFACE_MESSAGES.previewUnavailable)}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : pills.length > 0 ? (
          <ul
            id={listboxId}
            role="listbox"
            aria-label={message(presentation.listboxLabel)}
            className="max-h-[28rem] min-h-0 flex-1 overflow-y-auto p-fg-1"
          >
            {pills.map((pill, i) => (
              <li key={pill.key} role="option" aria-selected={i === safeCursor}>
                <button
                  type="button"
                  disabled={!pill.selectable}
                  tabIndex={-1}
                  onClick={() => {
                    if (!pill.selectable) return;
                    setSearchPaletteCursor(i);
                    setSearchPaletteExpanded(true);
                  }}
                  className="block w-full text-left"
                >
                  <SearchResultPill view={pill} selected={i === safeCursor} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="max-h-[28rem] min-h-0 flex-1 overflow-y-auto p-fg-1">
            <SearchEmptyState
              stateMode={presentation.stateMode}
              message={
                presentation.emptyMessage ? message(presentation.emptyMessage) : null
              }
            />
          </div>
        )}

        {presentation.incompleteNote && (
          <div className="border-t border-rule px-fg-4 py-fg-1 text-caption text-ink-muted">
            {message(presentation.incompleteNote)}
          </div>
        )}

        <div className="flex items-center gap-fg-3 border-t border-rule px-fg-4 py-fg-2">
          <LegendHint
            keys={["↑", "↓"]}
            label={message(presentation.footerHints.move)}
          />
          {presentation.showExpandedPanel && (
            <LegendHint
              keys={["←", "→"]}
              label={message(presentation.footerHints.previousNext)}
            />
          )}
          <LegendHint keys={["↵"]} label={message(presentation.footerHints.open)} />
          <LegendHint keys={["esc"]} label={message(presentation.footerHints.close)} />
        </div>

        <div id={liveRegionId} aria-live="polite" className="sr-only">
          {presentation.liveMessage ? message(presentation.liveMessage) : ""}
        </div>
      </div>
    </div>
  );
}
