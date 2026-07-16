// Kit SearchField (figma-frontend-rewrite W01.P02 — binding Figma component kit
// board "Design System — Components" 135:2, SearchField symbol). A standardized,
// controlled text field carrying a LEADING Lucide magnifying-glass glyph and a
// placeholder — the centralized definition every "search" affordance composes
// from (the stage toolbar "Search documents…", the left-rail filter, the command
// palette), so they never drift into per-surface hand-built fields.
//
// Display-only and prop-driven: it holds no wire state, issues no fetch, and emits
// the next string through `onChange`. The optional clear control appears only when
// the field is non-empty AND a handler is supplied.

import type { FocusEventHandler, KeyboardEventHandler, Ref } from "react";
import { Search, X } from "lucide-react";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";

// 14px structural-chrome glyph — the search mark reads as attenuated chrome inside
// the field, matching the rail's other Lucide marks.
const GLYPH_PX = 14;

export interface SearchFieldProps {
  /** The current query text (controlled). */
  value: string;
  /** Emits the next query text on every edit. */
  onChange: (value: string) => void;
  /** Placeholder prose naming what is searched (e.g. "Search documents…"). */
  placeholder?: string;
  /** Accessible name for the input; falls back to the placeholder. */
  ariaLabel?: string;
  /** When supplied, a clear (✕) control renders while the field is non-empty. */
  onClear?: () => void;
  disabled?: boolean;
  id?: string;
  /** Forwarded input ref — lets a composing combobox focus/measure the field. */
  inputRef?: Ref<HTMLInputElement>;
  /** Key handler on the input — for combobox arrow/enter/escape navigation
   *  (Class-B widget keys stay in the composing component, not the keymap). */
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  /** Combobox ARIA, supplied by a composing autocomplete (e.g. the feature bar). */
  role?: "combobox";
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  /** Required when the composing autocomplete PORTALS its listbox: the active
   *  option is no longer a DOM descendant, so aria-owns re-establishes the
   *  ownership aria-activedescendant needs to announce it. */
  "aria-owns"?: string;
  "aria-activedescendant"?: string;
  "aria-autocomplete"?: "list";
}

export function SearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  onClear,
  disabled,
  id,
  inputRef,
  onKeyDown,
  onFocus,
  onBlur,
  role,
  "aria-expanded": ariaExpanded,
  "aria-controls": ariaControls,
  "aria-owns": ariaOwns,
  "aria-activedescendant": ariaActiveDescendant,
  "aria-autocomplete": ariaAutocomplete,
}: SearchFieldProps) {
  const resolveMessage = useLocalizedMessageResolver();
  const hasValue = value.length > 0;
  return (
    <div
      className="flex h-[2.125rem] shrink-0 items-center gap-fg-2 rounded-fg-md border border-rule bg-paper-sunken px-[0.625rem] transition-colors duration-ui-fast focus-within:border-rule-strong"
      data-kit="search-field"
    >
      <span className="shrink-0 text-ink-faint" aria-hidden>
        <Search size={GLYPH_PX} />
      </span>
      <input
        ref={inputRef}
        type="text"
        id={id}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        role={role}
        aria-expanded={ariaExpanded}
        aria-controls={ariaControls}
        aria-owns={ariaOwns}
        aria-activedescendant={ariaActiveDescendant}
        aria-autocomplete={ariaAutocomplete}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        className="min-w-0 flex-1 bg-transparent text-[0.75rem] text-ink outline-none placeholder:text-ink-faint focus-visible:outline-none disabled:opacity-50"
        data-kit-search-input
      />
      {onClear && hasValue && (
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          aria-label={resolveMessage({ key: "common:actions.clearSearch" }).message}
          className="shrink-0 rounded-fg-xs text-ink-faint transition-colors duration-ui-fast hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50"
          data-kit-search-clear
        >
          <X size={GLYPH_PX} />
        </button>
      )}
    </div>
  );
}
