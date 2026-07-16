// FilterMenu — the unified filter flyout (filter-controls campaign; binding Figma
// "graph/Filter menu" 217:633). One presentational instrument that hosts every
// filter section — KIND, TOPIC, STATUS, HEALTH, EDITED — composed entirely from the
// centralized kit (SectionLabel, SearchField, FacetRow). It is a dumb projection:
// props in (section vocabularies + selections), intent out (toggle / select / clear /
// search). It fetches nothing, holds no wire state, and reads no raw tiers block —
// the stores container (FilterSidebar) feeds it and owns the wire
// (dashboard-layer-ownership). Anchoring/dismiss is the caller's concern; this is the
// panel body only, on the binding popover elevation.

import type { ReactNode } from "react";

import { formatNumber } from "../../platform/localization/formatters";
import {
  useActiveLocale,
  useLocalizedMessageResolver,
  type LocalizedMessageResolver,
} from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import {
  FILTER_MESSAGES,
  type FilterOptionLabel,
} from "../../stores/view/filterPresentation";
import { type FacetDotTone, FacetRow } from "../kit/FacetRow";
import { SearchField, SectionLabel, Skeleton, SkeletonRow } from "../kit";

export interface FilterFacetOption {
  /** Stable facet value sent to the wire (e.g. "research", "dangling"). */
  value: string;
  /** Localized static copy or byte-exact authored feature data. */
  label: FilterOptionLabel;
  /** Corpus members carrying this facet. */
  count?: number;
  /** Optional status/health dot tone. */
  dot?: FacetDotTone;
}

interface CheckboxSection {
  type: "checkbox";
  key: string;
  label: MessageDescriptor;
  options: FilterFacetOption[];
  selected: string[];
  onToggle: (value: string) => void;
  /** Optional in-section search field (TOPIC). */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: MessageDescriptor;
  };
  /** "none in corpus" vs "loading…" empty-state cue. */
  loading?: boolean;
  emptyLabel?: MessageDescriptor;
}

interface RadioSection {
  type: "radio";
  key: string;
  label: MessageDescriptor;
  options: { value: string; label: MessageDescriptor }[];
  value: string;
  onSelect: (value: string) => void;
}

export type FilterMenuSection = CheckboxSection | RadioSection;

export interface FilterMenuProps {
  /** Panel title (default "Filter documents"). */
  title?: MessageDescriptor;
  /** Whether any filter is active — gates the "Clear all" action. */
  anyActive?: boolean;
  /** Clear every active filter. */
  onClearAll?: () => void;
  /** The ordered filter sections. */
  sections: FilterMenuSection[];
  /** Fixed panel width in px (binding = 252). */
  width?: number;
  /** Optional cap on the menu height; the sections scroll inside while the header
   *  stays pinned. Live surfaces pass a viewport-relative cap so a large corpus
   *  vocabulary cannot overflow off-screen; the parity harness omits it. */
  maxHeight?: number | string;
  /** Compact (mobile) presentation: render each facet section as toggle CHIPS in a
   *  bottom sheet (binding compact Filter frame 790:3278) instead of the desktop
   *  checkbox rows, with a "Show results" apply/close action. The container chrome
   *  (border/elevation) is the sheet's; this renders the body only. */
  chips?: boolean;
  /** Compact apply/close action for the chip CTA. */
  onApply?: () => void;
}

/** A single toggle facet chip (compact): filled accent + paper ink when selected,
 *  quiet sunken pill otherwise (matching the binding Chip Active treatment). */
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-9 items-center rounded-fg-pill px-fg-3 py-fg-1-5 text-label transition-colors duration-ui-fast ease-settle outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
        active
          ? "bg-accent text-paper"
          : "bg-paper-sunken text-ink-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function localizedText(
  value: FilterOptionLabel,
  resolveMessage: LocalizedMessageResolver,
): string | null {
  if (value.kind === "authored") return value.value;
  const resolved = resolveMessage(value.descriptor);
  return resolved.usedFallback ? null : resolved.message;
}

/** Compact chip body: each checkbox section becomes a wrapped chip group; the date
 *  (radio) section is omitted (the timeline owns the date window). */
function ChipsBody({
  sections,
  title,
  anyActive,
  onClearAll,
  onApply,
  resolveMessage,
}: {
  sections: FilterMenuSection[];
  title: string;
  anyActive: boolean;
  onClearAll?: () => void;
  onApply?: () => void;
  resolveMessage: LocalizedMessageResolver;
}) {
  const facetSections = sections.filter(
    (s): s is CheckboxSection => s.type === "checkbox",
  );
  return (
    <div className="flex flex-col gap-fg-4 pb-fg-2" data-filter-menu>
      <div className="flex items-center justify-between">
        <span className="text-title font-medium text-ink">{title}</span>
        {anyActive && onClearAll && (
          <button
            type="button"
            onClick={onClearAll}
            className="rounded-fg-xs text-body font-medium text-accent-text transition-colors duration-ui-fast hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            {resolveMessage(FILTER_MESSAGES.reset).message}
          </button>
        )}
      </div>
      {facetSections.map((section) => {
        const selected = new Set(section.selected);
        return (
          <div key={section.key} className="flex flex-col gap-fg-2">
            <SectionLabel>{resolveMessage(section.label).message}</SectionLabel>
            <div className="flex flex-wrap gap-fg-2">
              {section.options.map((opt) => {
                const label = localizedText(opt.label, resolveMessage);
                return label === null ? null : (
                  <FilterChip
                    key={opt.value}
                    active={selected.has(opt.value)}
                    onClick={() => section.onToggle(opt.value)}
                  >
                    {label}
                  </FilterChip>
                );
              })}
            </div>
          </div>
        );
      })}
      {onApply && (
        <button
          type="button"
          onClick={onApply}
          className="mt-fg-1 flex w-full items-center justify-center rounded-fg-md bg-accent px-fg-3 py-fg-2 text-body font-medium text-paper transition-colors duration-ui-fast ease-settle hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          {resolveMessage(FILTER_MESSAGES.showResults).message}
        </button>
      )}
    </div>
  );
}

function CheckboxBody({
  section,
  locale,
  resolveMessage,
}: {
  section: CheckboxSection;
  locale: string;
  resolveMessage: LocalizedMessageResolver;
}) {
  const selected = new Set(section.selected);
  const empty = section.options.length === 0;
  return (
    <>
      {section.search && (
        <SearchField
          value={section.search.value}
          onChange={section.search.onChange}
          placeholder={resolveMessage(section.search.placeholder).message}
          ariaLabel={resolveMessage(section.search.placeholder).message}
        />
      )}
      {empty ? (
        section.loading ? (
          // Loading is UI-ONLY (state-mode-uniformity ADR D2): a text-free skeleton
          // mimicking facet rows, the human label only in the kit `Skeleton`'s sr-only.
          // The empty (not-loading) case stays a plain sentence.
          <Skeleton
            label={resolveMessage(FILTER_MESSAGES.loading).message}
            className="px-fg-1-5 py-fg-0-5 gap-fg-1"
          >
            <SkeletonRow width="w-3/4" />
            <SkeletonRow width="w-2/3" />
            <SkeletonRow width="w-5/6" />
          </Skeleton>
        ) : (
          <p className="px-fg-1-5 py-fg-0-5 text-meta text-ink-muted">
            {resolveMessage(section.emptyLabel ?? FILTER_MESSAGES.empty).message}
          </p>
        )
      ) : (
        <ul role="list" className="flex flex-col gap-fg-0-5">
          {section.options.map((opt) => {
            const label = localizedText(opt.label, resolveMessage);
            return label === null ? null : (
              <li key={opt.value}>
                <FacetRow
                  label={label}
                  count={
                    opt.count === undefined
                      ? undefined
                      : (formatNumber(locale, opt.count) ?? undefined)
                  }
                  dot={opt.dot}
                  checked={selected.has(opt.value)}
                  onToggle={() => section.onToggle(opt.value)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function RadioBody({
  section,
  resolveMessage,
}: {
  section: RadioSection;
  resolveMessage: LocalizedMessageResolver;
}) {
  return (
    <ul
      role="radiogroup"
      aria-label={resolveMessage(section.label).message}
      className="flex flex-col gap-fg-0-5"
    >
      {section.options.map((opt) => (
        <li key={opt.value}>
          <FacetRow
            control="radio"
            name={`filter-${section.key}`}
            label={resolveMessage(opt.label).message}
            checked={section.value === opt.value}
            onToggle={() => section.onSelect(opt.value)}
          />
        </li>
      ))}
    </ul>
  );
}

export function FilterMenu({
  title = FILTER_MESSAGES.title,
  anyActive = false,
  onClearAll,
  sections,
  width = 252,
  maxHeight,
  chips = false,
  onApply,
}: FilterMenuProps) {
  const locale = useActiveLocale();
  const resolveMessage = useLocalizedMessageResolver();
  const resolvedTitle = resolveMessage(title).message;
  if (chips) {
    return (
      <ChipsBody
        sections={sections}
        title={resolvedTitle}
        anyActive={anyActive}
        onClearAll={onClearAll}
        onApply={onApply}
        resolveMessage={resolveMessage}
      />
    );
  }
  const sectionList = sections.map((section, i) => (
    <div key={section.key} className="flex flex-col gap-fg-1">
      {i > 0 && <div className="my-fg-1 h-px w-full bg-rule" />}
      <SectionLabel>{resolveMessage(section.label).message}</SectionLabel>
      {section.type === "checkbox" ? (
        <CheckboxBody
          section={section}
          locale={locale}
          resolveMessage={resolveMessage}
        />
      ) : (
        <RadioBody section={section} resolveMessage={resolveMessage} />
      )}
    </div>
  ));

  return (
    <div
      role="group"
      aria-label={resolvedTitle}
      data-filter-menu
      style={{ width, maxHeight }}
      className="flex flex-col gap-fg-1-5 overflow-hidden rounded-fg-md border border-rule bg-paper px-fg-3 pb-fg-2 pt-fg-3 shadow-fg-overlay"
    >
      {/* Header — title + Clear all (left-aligned, binding 224:630). Pinned. */}
      <div className="flex shrink-0 items-center gap-fg-1-5">
        <span className="text-body font-semibold text-ink">{resolvedTitle}</span>
        {anyActive && onClearAll && (
          <button
            type="button"
            onClick={onClearAll}
            className="rounded-fg-xs text-meta font-medium text-accent-text transition-colors duration-ui-fast hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            {resolveMessage(FILTER_MESSAGES.clearAll).message}
          </button>
        )}
      </div>

      {/* When capped, the sections scroll inside the bordered card (the binding
          popover is compact; a large live vocabulary must not overflow). The
          negative inline padding keeps the scrollbar off the rows' right edge. */}
      {maxHeight ? (
        <div className="-mr-fg-1-5 flex min-h-0 flex-1 flex-col gap-fg-1-5 overflow-y-auto pr-fg-1-5">
          {sectionList}
        </div>
      ) : (
        sectionList
      )}
    </div>
  );
}
