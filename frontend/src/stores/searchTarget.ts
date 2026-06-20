export type SearchTarget = "vault" | "code";

export const SEARCH_TARGET_OPTIONS = [
  "vault",
  "code",
] as const satisfies readonly SearchTarget[];

export const DEFAULT_SEARCH_TARGET: SearchTarget = "vault";

export function normalizeSearchTarget(target: unknown): SearchTarget {
  if (typeof target !== "string") return DEFAULT_SEARCH_TARGET;
  const normalized = target.trim();
  return (
    SEARCH_TARGET_OPTIONS.find((option) => option === normalized) ??
    DEFAULT_SEARCH_TARGET
  );
}

export function normalizeOptionalSearchTarget(target: unknown): SearchTarget | null {
  if (typeof target !== "string") return null;
  const normalized = target.trim();
  return SEARCH_TARGET_OPTIONS.find((option) => option === normalized) ?? null;
}
