import {
  normalizeScopeId,
  SCOPE_ID_MAX_CHARS,
} from "../../platform/scope/scopeIdentity";

export { SCOPE_ID_MAX_CHARS };

export const VIEW_STORE_SESSION_STRING_LIST_MAX_ITEMS = 512;

export function normalizeViewStoreSessionString(value: unknown): string | null {
  return normalizeScopeId(value);
}

export function normalizeViewStoreSessionStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of value) {
    const text = normalizeViewStoreSessionString(entry);
    if (text === null || seen.has(text)) continue;
    seen.add(text);
    normalized.push(text);
    if (normalized.length >= VIEW_STORE_SESSION_STRING_LIST_MAX_ITEMS) break;
  }
  return normalized;
}
