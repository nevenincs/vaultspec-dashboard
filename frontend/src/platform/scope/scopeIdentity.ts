export const SCOPE_ID_MAX_CHARS = 2048;

export function normalizeScopeId(scope: unknown): string | null {
  if (typeof scope !== "string") return null;
  const normalized = scope.trim();
  return normalized.length > 0 && normalized.length <= SCOPE_ID_MAX_CHARS
    ? normalized
    : null;
}

export function normalizeOptionalScopeId(scope: unknown): string | undefined {
  return normalizeScopeId(scope) ?? undefined;
}

export function normalizeOptionalNullableScopeId(
  scope: unknown,
): string | null | undefined {
  if (scope === null) return null;
  return normalizeOptionalScopeId(scope);
}
