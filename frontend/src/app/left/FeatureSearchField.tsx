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
// A suggestion row is the readable NAME over its served size. It used to print the
// raw tag on the second line — the same information de-kebabed, read as noise — so
// the tag now rides the row's hover tooltip and the second line carries metadata you
// cannot get from the name: how many documents the feature holds. That count is
// ENGINE-SERVED off the feature roster (`{feature, doc_count, types_present}`) and
// joined by tag; it is never re-counted from a client listing (complete-set law), and
// a feature the roster does not carry simply shows no second line. The feature's date
// span belongs on this line too and is omitted until the wire carries it.
//
// The roster query lives on the SUGGESTION LIST, which mounts only while the dropdown
// is open — a closed dropdown fetches nothing (mount-gating-is-the-canonical-
// visibility-mechanism).
//
// The dropdown is a "find a feature" affordance driven ONLY by what the user is
// actively typing — it is NEVER constrained by the already-applied filter the field
// echoes (Issue #6.1). A bare (re)focus browses the FULL vocabulary so you can switch
// features; the applied filter narrows the rail tree, not the candidate list.
//
// The autocomplete keys (Arrow/Enter/Escape) are Class-B widget interaction and stay
// in this component — they are NOT routed through the keymap registry
// (keyboard-shortcuts-bind-through-the-one-keymap-registry). Read-only navigation
// law: this emits no scope/node selection and never fetches.

import type { KeyboardEvent } from "react";
import { useId, useMemo, useRef, useState } from "react";

import { SearchField } from "../kit";
import {
  featureTagSuggestions,
  type FeatureTagSuggestion,
} from "../../stores/featureQuery";
import {
  useActiveScope,
  useFeatureRosterView,
  useFiltersVocabularyView,
} from "../../stores/server/queries";
import { useDashboardFeatureFilterDraft } from "../../stores/view/dashboardFeatureFilter";
import {
  useActiveLocale,
  useLocalizedMessageResolver,
} from "../../platform/localization/LocalizationProvider";
import { createCountMessageDescriptor } from "../../platform/localization/message";

/** The open dropdown. It OWNS the feature-roster read, so the served per-feature
 *  document count is fetched only while the list is actually on screen, and a rail
 *  sitting with the field closed costs nothing. A feature missing from the roster
 *  (or a degraded roster, which the stores view empties) renders its name alone —
 *  never a zero standing in for an unknown. */
function FeatureSuggestionList({
  listboxId,
  scope,
  suggestions,
  activeIndex,
  onHover,
  onCommit,
}: {
  listboxId: string;
  scope: unknown;
  suggestions: FeatureTagSuggestion[];
  activeIndex: number;
  onHover: (index: number) => void;
  onCommit: (tag: string) => void;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const roster = useFeatureRosterView(scope);
  const rosterEntries = roster.roster;
  const docCountByTag = useMemo(
    () => new Map(rosterEntries.map((entry) => [entry.feature, entry.doc_count])),
    [rosterEntries],
  );
  return (
    <ul
      id={listboxId}
      role="listbox"
      aria-label={
        resolveMessage({ key: "common:rail.accessibility.featureSuggestions" }).message
      }
      data-feature-suggestions
      className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-40 max-h-[16rem] overflow-y-auto rounded-fg-md border border-rule bg-paper py-fg-1 shadow-fg-overlay"
    >
      {suggestions.map((suggestion, index) => {
        const docCount = docCountByTag.get(suggestion.tag);
        const countDescriptor =
          docCount === undefined
            ? null
            : createCountMessageDescriptor(
                "documents:documentSearch.counts.documents",
                docCount,
              );
        const countLabel =
          countDescriptor === null ? null : resolveMessage(countDescriptor);
        return (
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
                onCommit(suggestion.tag);
              }}
              onMouseEnter={() => onHover(index)}
              // The raw tag is the row's IDENTITY, revealed on hover rather than
              // printed as a second line that only repeated the name (owner review).
              title={suggestion.tag}
              className={`flex w-full flex-col items-start gap-fg-0-5 px-fg-3 py-fg-1 text-left transition-colors duration-ui-fast ${
                index === activeIndex ? "bg-paper-sunken" : "hover:bg-paper-sunken"
              }`}
            >
              {/* The suggestion name is corpus data: selectable inside the option
                  button (touch-selectability ADR D2). */}
              <span className="w-full select-text truncate text-[0.75rem] text-ink">
                {suggestion.display}
              </span>
              {countLabel !== null && !countLabel.usedFallback && (
                <span
                  className="w-full truncate text-[0.6875rem] tabular-nums text-ink-muted"
                  data-feature-suggestion-meta
                >
                  {countLabel.message}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function FeatureSearchField() {
  const scope = useActiveScope();
  const draft = useDashboardFeatureFilterDraft(scope);
  const vocabulary = useFiltersVocabularyView(scope);
  const locale = useActiveLocale();
  const resolveMessage = useLocalizedMessageResolver();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Whether the user has typed since the field last gained focus. A bare (re)focus
  // is a browse intent and lists the FULL vocabulary (so an applied filter the field
  // echoes never constrains the candidates — Issue #6.1); each keystroke then narrows
  // the suggestions by the typed text. The applied filter drives the rail tree, never
  // this list.
  const [edited, setEdited] = useState(false);

  const suggestions = useMemo(
    () =>
      featureTagSuggestions(edited ? draft.value : "", vocabulary.featureTags, locale),
    [edited, draft.value, vocabulary.featureTags, locale],
  );
  const showList = open && suggestions.length > 0;
  const activeOptionId =
    showList && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined;

  const commitTag = (tag: string) => {
    draft.commit(tag);
    setOpen(false);
    setActiveIndex(-1);
    setEdited(false);
    inputRef.current?.focus();
  };

  const handleChange = (value: string) => {
    draft.setValue(value);
    setOpen(true);
    setEdited(true);
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
        onFocus={() => {
          // A fresh focus is a browse intent: reset to the full candidate list and
          // select the echoed filter so the next keystroke replaces it rather than
          // appending to the applied value.
          setOpen(true);
          setEdited(false);
          inputRef.current?.select();
        }}
        onKeyDown={handleKeyDown}
        inputRef={inputRef}
        placeholder={
          resolveMessage({ key: "common:rail.filters.featurePlaceholder" }).message
        }
        ariaLabel={resolveMessage({ key: "common:rail.filters.featureAria" }).message}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
      />
      {showList && (
        <FeatureSuggestionList
          listboxId={listboxId}
          scope={scope}
          suggestions={suggestions}
          activeIndex={activeIndex}
          onHover={setActiveIndex}
          onCommit={commitTag}
        />
      )}
    </div>
  );
}
