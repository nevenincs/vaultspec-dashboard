// Localized rendering for the safe search-result projection.

import type { SearchPillView } from "../../stores/server/searchPill";
import {
  useActiveLocale,
  useLocalizedMessageResolver,
} from "../../platform/localization/LocalizationProvider";
import { formatRelativeTime } from "../../platform/localization/formatters";
import type { MessageDescriptor } from "../../platform/localization/message";

function isMessageDescriptor(value: unknown): value is MessageDescriptor {
  return typeof value === "object" && value !== null && "key" in value;
}

export function SearchResultPill({
  view,
  selected,
}: {
  view: SearchPillView;
  selected: boolean;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const locale = useActiveLocale();
  const typeWord = resolveMessage(view.typeWord).message;
  const title = isMessageDescriptor(view.title)
    ? resolveMessage(view.title).message
    : view.title;
  const why =
    typeof view.why === "string" || view.why === null
      ? view.why
      : formatRelativeTime(locale, view.why.value, view.why.unit, {
          numeric: "auto",
        });
  const accessibility = resolveMessage({
    key: view.selectable
      ? "common:searchPalette.accessibility.selectableResult"
      : "common:searchPalette.accessibility.unavailableResult",
    values: { title },
  }).message;

  return (
    <div>
      <span className="sr-only">{accessibility}</span>
      <div
        aria-hidden="true"
        className={`flex w-full flex-col gap-fg-1 rounded-fg-sm border-[0.09375rem] px-fg-3 py-fg-2 ${
          selected ? "border-accent bg-paper-sunken" : "border-transparent"
        }`}
      >
        <div className="flex items-center gap-fg-2 overflow-hidden">
          <span
            className="shrink-0 text-caption font-medium"
            style={{ color: view.typeColorVar }}
          >
            {typeWord}
          </span>
          <span
            className={`min-w-0 flex-1 select-text truncate text-body text-ink ${
              view.titleMono ? "font-mono" : "font-medium"
            }`}
          >
            {title}
          </span>
          {view.featureTag && (
            <span
              className={`shrink-0 select-text rounded-fg-pill px-fg-2 py-fg-0-5 text-caption text-ink-muted ${
                selected ? "bg-paper-raised" : "bg-paper-sunken"
              }`}
            >
              {view.featureTag}
            </span>
          )}
        </div>
        {why && (
          <span
            className={`block w-full select-text truncate text-caption text-ink-muted ${
              view.whyMono ? "font-mono" : ""
            }`}
          >
            {why}
          </span>
        )}
      </div>
    </div>
  );
}
