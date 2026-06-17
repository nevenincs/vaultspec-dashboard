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

import { Search, X } from "lucide-react";

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
}

export function SearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  onClear,
  disabled,
  id,
}: SearchFieldProps) {
  const hasValue = value.length > 0;
  return (
    <div
      className="flex h-[34px] shrink-0 items-center gap-fg-2 rounded-fg-md border border-rule bg-paper-sunken px-[10px] transition-colors duration-ui-fast focus-within:border-rule-strong"
      data-kit="search-field"
    >
      <span className="shrink-0 text-ink-faint" aria-hidden>
        <Search size={GLYPH_PX} />
      </span>
      <input
        type="text"
        id={id}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-faint focus-visible:outline-none disabled:opacity-50"
        data-kit-search-input
      />
      {onClear && hasValue && (
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          aria-label="clear search"
          className="shrink-0 rounded-fg-xs text-ink-faint transition-colors duration-ui-fast hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50"
          data-kit-search-clear
        >
          <X size={GLYPH_PX} />
        </button>
      )}
    </div>
  );
}
