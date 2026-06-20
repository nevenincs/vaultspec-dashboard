export const SCOPED_STORAGE_DEFAULT_KEY_PART = "default";
export const SCOPED_STORAGE_KEY_PART_MAX_CHARS = 2048;

export function normalizeScopedStorageKeyPart(value: unknown): string {
  if (typeof value !== "string") return SCOPED_STORAGE_DEFAULT_KEY_PART;
  const normalized = value.trim();
  return normalized.length > 0 &&
    normalized.length <= SCOPED_STORAGE_KEY_PART_MAX_CHARS
    ? normalized
    : SCOPED_STORAGE_DEFAULT_KEY_PART;
}

export function encodeScopedStorageKeyPart(value: unknown): string {
  return encodeURIComponent(normalizeScopedStorageKeyPart(value));
}

export function scopedStorageKey(
  prefix: string,
  workspace: unknown,
  scope: unknown,
): string {
  return `${prefix}:workspace:${encodeScopedStorageKeyPart(workspace)}:scope:${encodeScopedStorageKeyPart(scope)}`;
}

export function legacyScopedStorageKey(
  prefix: string,
  workspace: unknown,
  scope: unknown,
): string {
  return `${prefix}:${normalizeScopedStorageKeyPart(workspace)}:${normalizeScopedStorageKeyPart(scope)}`;
}

export function legacyEncodedScopedStorageKey(
  prefix: string,
  workspace: unknown,
  scope: unknown,
): string {
  return `${prefix}:${encodeScopedStorageKeyPart(workspace)}:${encodeScopedStorageKeyPart(scope)}`;
}

export function scopedStorageIndexKey(prefix: string, workspace: unknown): string {
  return `${prefix}:workspace:${encodeScopedStorageKeyPart(workspace)}:index`;
}

export function legacyStorageIndexKey(prefix: string, workspace: unknown): string {
  return `${prefix}:${normalizeScopedStorageKeyPart(workspace)}::index`;
}

export function legacyEncodedStorageIndexKey(
  prefix: string,
  workspace: unknown,
): string {
  return `${prefix}:${encodeScopedStorageKeyPart(workspace)}::index`;
}
