// Document name search backed by the production search controller.

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
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import {
  createCountMessageDescriptor,
  type AnyMessageDescriptor,
  type MessageDescriptor,
} from "../../platform/localization/message";
import { Skeleton, SkeletonRow, StateBlock } from "../kit";
import { trapTabFocus } from "../chrome/focusTrap";
import { useDismissOnEscape } from "../chrome/useDismissOnEscape";
import { useFocusRestore } from "../chrome/useFocusRestore";
import { SearchResultPill } from "./SearchResultPill";

export const DOCUMENT_SEARCH_MESSAGES = {
  dialog: { key: "documents:documentSearch.accessibility.dialog" },
  idle: { key: "documents:documentSearch.states.idle" },
  noMatches: { key: "documents:documentSearch.states.noMatches" },
  placeholder: { key: "documents:documentSearch.placeholders.query" },
  results: { key: "documents:documentSearch.accessibility.results" },
  searching: { key: "documents:documentSearch.states.searching" },
  unavailable: { key: "documents:documentSearch.states.unavailable" },
} as const satisfies Record<string, MessageDescriptor>;

export function documentSearchCountMessage(count: number): AnyMessageDescriptor {
  return (
    createCountMessageDescriptor("documents:documentSearch.counts.documents", count) ??
    DOCUMENT_SEARCH_MESSAGES.results
  );
}

export function documentSearchNoMatchesMessage(query: string): MessageDescriptor {
  return {
    ...DOCUMENT_SEARCH_MESSAGES.noMatches,
    values: { query },
  };
}

export function DocumentSearchSurface() {
  const resolveMessage = useLocalizedMessageResolver();
  const message = (descriptor: AnyMessageDescriptor) =>
    resolveMessage(descriptor).message;
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
      ? message(documentSearchCountMessage(count))
      : state === "loading"
        ? message(DOCUMENT_SEARCH_MESSAGES.searching)
        : "";
  const idlePrompt =
    count === 0 && query.trim().length === 0
      ? message(DOCUMENT_SEARCH_MESSAGES.idle)
      : null;

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
        aria-label={message(DOCUMENT_SEARCH_MESSAGES.dialog)}
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
            placeholder={message(DOCUMENT_SEARCH_MESSAGES.placeholder)}
            className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-faint"
          />
          {countLabel && (
            <span className="shrink-0 text-caption text-ink-muted" data-tabular>
              {countLabel}
            </span>
          )}
        </div>

        {count > 0 ? (
          <ul
            id={listboxId}
            role="listbox"
            aria-label={message(DOCUMENT_SEARCH_MESSAGES.results)}
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
          <div className="px-fg-4 py-fg-6 text-caption text-ink-muted">
            {idlePrompt}
          </div>
        ) : state === "loading" ? (
          <Skeleton
            label={message(DOCUMENT_SEARCH_MESSAGES.searching)}
            className="p-fg-1"
          >
            <SkeletonRow width="w-2/3" />
            <SkeletonRow width="w-1/2" />
            <SkeletonRow width="w-3/5" />
          </Skeleton>
        ) : state === "degraded" ? (
          <StateBlock
            mode="degraded"
            message={message(DOCUMENT_SEARCH_MESSAGES.unavailable)}
          />
        ) : (
          <StateBlock
            mode="empty"
            message={message(documentSearchNoMatchesMessage(query))}
          />
        )}
      </div>
    </div>
  );
}
