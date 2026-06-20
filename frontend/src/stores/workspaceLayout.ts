export const WORKSPACE_LAYOUT_BLOB_MAX_CHARS = 64 * 1024;

export function normalizeWorkspaceLayoutBlob(blob: unknown): string | null {
  if (typeof blob !== "string") return null;
  const normalized = blob.trim();
  if (normalized.length === 0) return null;
  return normalized.length <= WORKSPACE_LAYOUT_BLOB_MAX_CHARS ? normalized : null;
}
