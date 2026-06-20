export const NODE_ID_MAX_CHARS = 2048;

export function normalizeNodeId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id.length > 0 && id.length <= NODE_ID_MAX_CHARS ? id : null;
}

export function normalizeNodeIds(ids: readonly unknown[], cap: number): string[] {
  if (cap <= 0) return [];
  const selectedIds: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = normalizeNodeId(raw);
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    selectedIds.push(id);
    if (selectedIds.length >= cap) break;
  }
  return selectedIds;
}
