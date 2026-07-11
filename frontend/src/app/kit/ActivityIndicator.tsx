// Shared data-activity indicator primitive (universal-data-loading ADR D2).
// The universal loading floor: a slim, non-blocking pulse bar pinned to the
// viewport top edge, shown whenever the one data-activity view says data is
// moving. Loading is UI-ONLY (state-mode-uniformity): the human label lives in
// `sr-only` under `role="status"`; the only on-screen text is the determinate
// row count when a listing drain is the activity ("2,000 rows…" — an honest
// so-far figure, never a fabricated percentage). Dumb chrome: props in,
// nothing derived, no fetch, no store reads — the connected wrapper in
// `app/chrome` owns the one `useDataActivityView` subscription.

export interface ActivityIndicatorProps {
  /** Render the indicator (the debounced `visible` from the activity view). */
  visible: boolean;
  /** Rows loaded so far by an in-flight listing drain, or null (indeterminate). */
  rowsLoaded?: number | null;
}

export function ActivityIndicator({
  visible,
  rowsLoaded = null,
}: ActivityIndicatorProps) {
  if (!visible) return null;
  return (
    <div
      data-kit="activity-indicator"
      className="pointer-events-none fixed inset-x-0 top-0 z-50"
    >
      {/* The live region announces only the STATIC label; the changing row
          count stays aria-hidden so a multi-page drain never queues repeated
          polite announcements (review nit: SR chattiness). */}
      <span role="status" className="sr-only">
        Loading data
      </span>
      <div
        aria-hidden
        className="h-[0.125rem] w-full bg-accent motion-safe:animate-pulse-live"
      />
      {rowsLoaded !== null && (
        <div aria-hidden className="flex justify-end pe-fg-2 pt-fg-1">
          <span className="rounded-fg-sm border border-rule bg-paper-raised/95 px-fg-2 py-fg-0-5 text-label text-ink-muted shadow-fg-overlay">
            <span data-tabular className="tabular-nums">
              {rowsLoaded.toLocaleString()}
            </span>{" "}
            rows…
          </span>
        </div>
      )}
    </div>
  );
}
