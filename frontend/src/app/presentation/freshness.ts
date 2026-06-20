// Shared compact recency labels for chrome surfaces.
//
// Pure presentation only: no wire access, no node identity, no query state. Left
// and right rail consumers import this neutral seam instead of reaching through
// another view surface for a helper.

/** Compact freshness label: <1h "now", then h/d/w buckets; cooled = "". */
export function freshnessLabel(modified: string | undefined, now: number): string {
  if (!modified) return "";
  const at = Date.parse(modified);
  if (!Number.isFinite(at)) return "";
  const age = now - at;
  if (age < 3600_000) return "now";
  if (age < 24 * 3600_000) return `${Math.floor(age / 3600_000)}h`;
  if (age < 7 * 24 * 3600_000) return `${Math.floor(age / (24 * 3600_000))}d`;
  if (age < 30 * 24 * 3600_000) return `${Math.floor(age / (7 * 24 * 3600_000))}w`;
  return "";
}

/** True only for genuinely fresh items (<1h) so accent is tied to real liveness. */
export function isFresh(label: string): boolean {
  return label === "now";
}
