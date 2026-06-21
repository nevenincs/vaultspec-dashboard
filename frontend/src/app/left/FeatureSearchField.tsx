// FeatureSearchField — the rail's canonical "filter by feature" bar (binding
// `LeftRail` 238:600 search field). It is a FEATURE filter, not a results-returning
// search: keystrokes drive the canonical backend `feature_query` (glob/regex over
// feature_tags) with NO fetch, narrowing the rail tree and the graph it projects to.
//
// It composes the centralized kit SearchField (design-system-is-centralized) and
// adds an autocomplete listbox of the preloaded feature-tag vocabulary. Suggestions
// match BOTH the sanitized display string ("Dashboard Left Rail") and the original
// hyphenated tag ("dashboard-left-rail"); choosing one fills the bar with that tag
// and applies it. Plain text is a substring feature search, `dashboard-*` is a glob,
// and `/pattern/` is an advanced regex (parsed in stores/featureQuery).
//
// The autocomplete keys (Arrow/Enter/Escape) are Class-B widget interaction and stay
// in this component — they are NOT routed through the keymap registry
// (keyboard-shortcuts-bind-through-the-one-keymap-registry). Read-only navigation
// law: this emits no scope/node selection and never fetches.

import type { KeyboardEvent } from "react";
import { useId, useMemo, useRef, useState } from "react";

import { SearchField } from "../kit";
import { featureTagSuggestions } from "../../stores/featureQuery";
import { useActiveScope, useFiltersVocabularyView } from "../../stores/server/queries";
import { useDashboardFeatureFilterDraft } from "../../stores/view/dashboardFeatureFilter";

export function FeatureSearchField() {
  const scope = useActiveScope();
  const draft = useDashboardFeatureFilterDraft(scope);
  const vocabulary = useFiltersVocabularyView(scope);
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const suggestions = useMemo(
    () => featureTagSuggestions(draft.value, vocabulary.featureTags),
    [draft.value, vocabulary.featureTags],
  );
  const showList = open && suggestions.length > 0;
  const activeOptionId =
    showList && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined;

  const commitTag = (tag: string) => {
    draft.commit(tag);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const handleChange = (value: string) => {
    draft.setValue(value);
    setOpen(true);
    setActiveIndex(-1);
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
        if (showList && activeIndex >= 0) {
          event.preventDefault();
          commitTag(suggestions[activeIndex]!.tag);
        } else {
          // Commit whatever is typed (a glob/regex or a plain term) immediately.
          draft.commit(draft.value);
          setOpen(false);
        }
        break;
      case "Escape":
        if (showList) {
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
      className="relative"
      data-feature-search
      onBlur={(event) => {
        // Close the list when focus leaves the field+list subtree (a suggestion
        // click moves focus inside it and must not dismiss before it registers).
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
          setActiveIndex(-1);
        }
      }}
    >
      <SearchField
        value={draft.value}
        onChange={handleChange}
        onClear={draft.clear}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        inputRef={inputRef}
        placeholder="Filter by feature…"
        ariaLabel="filter the vault by feature"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
      />
      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="feature suggestions"
          data-feature-suggestions
          className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-40 max-h-[16rem] overflow-y-auto rounded-fg-md border border-rule bg-paper py-fg-1 shadow-fg-overlay"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.tag} role="presentation">
              <button
                type="button"
                id={`${listboxId}-opt-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                // Keep focus on the input so the field's blur-dismiss does not race
                // the click; commit on mouse-down.
                onMouseDown={(event) => {
                  event.preventDefault();
                  commitTag(suggestion.tag);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full flex-col items-start gap-fg-0-5 px-fg-3 py-fg-1 text-left transition-colors duration-ui-fast ${
                  index === activeIndex ? "bg-paper-sunken" : "hover:bg-paper-sunken"
                }`}
              >
                <span className="text-[0.75rem] text-ink">{suggestion.display}</span>
                <span className="text-[0.6875rem] text-ink-faint">
                  {suggestion.tag}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
