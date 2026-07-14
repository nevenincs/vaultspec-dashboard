// AutocompleteCombobox — the editor's shared "search a vocabulary and pick" field
// (document-editor-redesign ADR). It composes the centralized kit SearchField and
// adds an autocomplete listbox, mirroring the rail's canonical FeatureSearchField:
// the Arrow/Enter/Escape keys are Class-B widget-intrinsic interaction and stay in
// this component (they are NOT routed through the keymap registry —
// keyboard-shortcuts-bind-through-the-one-keymap-registry). Both editor pickers —
// the single-select Feature bar and the multi-select Related linker — compose this
// one primitive so the picker behavior is defined exactly once (no ad-hoc field).
//
// Display-only and prop-driven: it holds no wire state and fetches nothing; the
// caller supplies the candidate options (already read from the stores corpus) and
// receives the committed value through `onCommit`.

import type { KeyboardEvent } from "react";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Category } from "../kit/category";
import { usePointerCoarse } from "../chrome/RowMenuDisclosure";
import { SearchField, StatusDot } from "../kit";

// The canonical category tokens a `.vault/` doc-type maps onto (kit category
// vocabulary). A doc-type outside this set (or absent) renders no dot rather than a
// mis-typed one — the row still reads by its title.
const CATEGORY_TOKENS = new Set<Category>([
  "adr",
  "audit",
  "code",
  "exec",
  "feature",
  "plan",
  "reference",
  "research",
]);

function docTypeCategory(docType: string | undefined): Category | null {
  return docType !== undefined && CATEGORY_TOKENS.has(docType as Category)
    ? (docType as Category)
    : null;
}

export interface ComboOption {
  /** The value committed on selection (a feature tag or a document stem). */
  value: string;
  /** The primary line (a human title or the feature display name). */
  primary: string;
  /** An optional secondary line (the stem, or the raw hyphenated tag). */
  secondary?: string;
  /** An optional doc-type, tinting a leading category dot on the row. */
  docType?: string;
}

export interface AutocompleteComboboxProps {
  options: readonly ComboOption[];
  onCommit: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  /** Clear the field after a commit (multi-select linking); single-select keeps
   *  the picked value in the field. Defaults to false. */
  clearOnCommit?: boolean;
  /** Allow committing the typed text when no option is active (a new feature tag).
   *  Defaults to false — Related links only to existing documents. */
  allowFreeText?: boolean;
  /** Message rendered when the query matches nothing (and free text is disallowed). */
  emptyLabel?: string;
  /** Seed the field with a current value (a single-select control showing its
   *  present selection). Applied once at mount; changing the selection is the
   *  component's own concern thereafter. */
  initialQuery?: string;
  /** Optional host submit intent (e.g. the create dialog): fired on Enter ONLY when
   *  the suggestion list is closed, after committing any typed free text — so the
   *  field stays a picker while open, yet an Enter with the list dismissed still
   *  submits the surrounding form. Omitted callers keep the pure picker behaviour. */
  onSubmit?: () => void;
}

function matches(option: ComboOption, q: string): boolean {
  return (
    option.value.toLowerCase().includes(q) ||
    option.primary.toLowerCase().includes(q) ||
    (option.secondary?.toLowerCase().includes(q) ?? false)
  );
}

export function AutocompleteCombobox({
  options,
  onCommit,
  placeholder,
  ariaLabel,
  clearOnCommit = false,
  allowFreeText = false,
  emptyLabel,
  initialQuery = "",
  onSubmit,
}: AutocompleteComboboxProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const coarse = usePointerCoarse();
  // The listbox's fixed-position placement (portaled to body so no dialog/scroll
  // container can clip it — the ContextMenuHost idiom). Space-aware: capped to
  // the room below the field, flipping above when below is too tight; floors at
  // a few rows so it never collapses to nothing on extreme viewports.
  const [placement, setPlacement] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q.length === 0 ? options : options.filter((o) => matches(o, q));
    return pool.slice(0, 50);
  }, [options, query]);

  const showList =
    open && (suggestions.length > 0 || (query.trim().length > 0 && !!emptyLabel));
  const activeOptionId =
    showList && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined;

  // Measure and place the portaled listbox while it is shown; re-place on
  // resize and on any ancestor scroll (capture) so it tracks the field.
  useLayoutEffect(() => {
    if (!showList) {
      setPlacement(null);
      return;
    }
    const GAP = 4;
    const FLOOR = 96; // never shorter than ~3 rows
    const CAP = 256; // the previous 16rem ceiling
    const place = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - GAP * 2;
      const above = rect.top - GAP * 2;
      const flip = below < FLOOR && above > below;
      const room = flip ? above : below;
      setPlacement({
        left: rect.left,
        width: rect.width,
        top: flip ? undefined : rect.bottom + GAP,
        bottom: flip ? window.innerHeight - rect.top + GAP : undefined,
        maxHeight: Math.max(FLOOR, Math.min(CAP, room)),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [showList]);

  const commit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    onCommit(trimmed);
    setOpen(false);
    setActiveIndex(-1);
    if (clearOnCommit) setQuery("");
    else setQuery(trimmed);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setOpen(true);
        setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
        break;
      case "Enter":
        event.preventDefault();
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          commit(suggestions[activeIndex]!.value);
        } else if (!showList && onSubmit) {
          // List dismissed: capture any typed free text, then hand off to the host's
          // submit (e.g. the create dialog) rather than swallowing the Enter.
          if (allowFreeText && query.trim().length > 0) commit(query);
          onSubmit();
        } else if (allowFreeText) {
          commit(query);
        }
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
          setActiveIndex(-1);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative"
      data-editor-combobox
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
          setActiveIndex(-1);
        }
      }}
    >
      <SearchField
        value={query}
        onChange={(value) => {
          setQuery(value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onClear={query.length > 0 ? () => setQuery("") : undefined}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        inputRef={inputRef}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
      />
      {showList &&
        placement !== null &&
        createPortal(
          <ul
            id={listboxId}
            role="listbox"
            aria-label={`${ariaLabel} suggestions`}
            data-editor-combobox-list
            // Fixed + portaled (ContextMenuHost idiom): no dialog body or scroll
            // container can clip the list; height is space-aware (measured room
            // below/above the field), so a soft-keyboard viewport still shows a
            // scrollable list instead of a cut-off one. Mousedown is swallowed so
            // a scrollbar drag never blurs the input and dismisses the list.
            style={{
              position: "fixed",
              left: placement.left,
              width: placement.width,
              top: placement.top,
              bottom: placement.bottom,
              maxHeight: placement.maxHeight,
            }}
            onMouseDown={(event) => event.preventDefault()}
            className="z-50 overflow-y-auto rounded-fg-md border border-rule bg-paper py-fg-1 shadow-fg-overlay"
          >
            {suggestions.length === 0 && emptyLabel ? (
              <li
                role="presentation"
                className="px-fg-3 py-fg-1 text-[0.6875rem] text-ink-faint"
              >
                {emptyLabel}
              </li>
            ) : (
              suggestions.map((option, index) => (
                <li key={option.value} role="presentation">
                  <button
                    type="button"
                    id={`${listboxId}-opt-${index}`}
                    role="option"
                    aria-label={option.primary}
                    aria-selected={index === activeIndex}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      commit(option.value);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex w-full items-center gap-fg-2 px-fg-3 py-fg-1 text-left transition-colors duration-ui-fast ${
                      coarse ? "min-h-[2.75rem]" : ""
                    } ${
                      index === activeIndex
                        ? "bg-paper-sunken"
                        : "hover:bg-paper-sunken"
                    }`}
                  >
                    {docTypeCategory(option.docType) !== null && (
                      <StatusDot category={docTypeCategory(option.docType)!} />
                    )}
                    {/* Option primary/secondary are corpus data: selectable inside
                      the option button (touch-selectability ADR D2). */}
                    <span className="flex min-w-0 select-text flex-col items-start gap-fg-0-5">
                      <span className="truncate text-[0.75rem] text-ink">
                        {option.primary}
                      </span>
                      {option.secondary && (
                        <span className="truncate text-[0.6875rem] text-ink-faint">
                          {option.secondary}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>,
          document.body,
        )}
    </div>
  );
}
