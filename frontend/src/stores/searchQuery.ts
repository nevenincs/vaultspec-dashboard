export const SEARCH_QUERY_MAX_CHARS = 512;

export function normalizeSearchQuery(query: unknown): string {
  if (typeof query !== "string") return "";
  const trimmed = query.trim();
  return trimmed.length > SEARCH_QUERY_MAX_CHARS
    ? trimmed.slice(0, SEARCH_QUERY_MAX_CHARS)
    : trimmed;
}
