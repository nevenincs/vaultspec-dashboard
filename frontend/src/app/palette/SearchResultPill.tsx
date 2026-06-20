// SearchResultPill (binding figma SearchResultPill set 650:1790) — one rag search
// hit rendered as a compact pill in the Cmd-K search surface. It is dumb chrome: it
// renders the `SearchPillView` the stores layer derives (no fetch, no raw `tiers`),
// and obeys the UX simplicity law baked into that view — the face shows only the
// plain colour-coded TYPE WORD, the TITLE, a one-line WHY, and (for docs) the feature
// chip. The relevance score, commit hash, and encoding deliberately never reach here.
//
// Composes the centralised token tier (design-system-is-centralized / no-hardcoded-px):
// the type-word colour is the bound scene/category css var carried on the view, the
// selected ring is the accent token, and sizing is the rem token scale. The selected
// state mirrors the Figma Selected variant — `surface/sunken` ground + a 1.5px
// `accent/base` ring (kept on every state as a transparent ring so selection never
// shifts the row).

import type { SearchPillView } from "../../stores/server/searchPill";

export function SearchResultPill({
  view,
  selected,
}: {
  view: SearchPillView;
  selected: boolean;
}) {
  return (
    <div
      className={`flex w-full flex-col gap-fg-1 rounded-fg-sm border-[0.09375rem] px-fg-3 py-fg-2 ${
        selected ? "border-accent bg-paper-sunken" : "border-transparent"
      }`}
    >
      <div className="flex items-center gap-fg-2 overflow-hidden">
        <span
          className="shrink-0 text-caption font-medium"
          style={{ color: view.typeColorVar }}
        >
          {view.typeWord}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-body text-ink ${
            view.titleMono ? "font-mono" : "font-medium"
          }`}
        >
          {view.title}
        </span>
        {view.featureTag && (
          <span
            className={`shrink-0 rounded-fg-pill px-fg-2 py-fg-0-5 text-caption text-ink-muted ${
              selected ? "bg-paper-raised" : "bg-paper-sunken"
            }`}
          >
            {view.featureTag}
          </span>
        )}
      </div>
      {view.why && (
        <span
          className={`block w-full truncate text-caption text-ink-faint ${
            view.whyMono ? "font-mono" : ""
          }`}
        >
          {view.why}
        </span>
      )}
    </div>
  );
}
