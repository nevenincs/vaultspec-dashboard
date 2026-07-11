// Pure tag helpers for the document editor's Feature control
// (document-editor-redesign ADR). A `.vault/` document carries exactly two tags:
// one fixed DIRECTORY tag (set by the folder — adr/audit/exec/index/plan/reference/
// research) and one FEATURE tag. The editor exposes only the feature as an editable
// control; the directory tag is shown read-only and always preserved. These helpers
// bridge the editor's comma-joined `tags` draft string and that two-tag model, and
// are unit-tested in isolation.

/** The directory tags every `.vault/` document may carry; the OTHER tag is the
 *  feature. `index` is included for completeness though index documents are not
 *  editable in the reader. */
export const VAULT_DIRECTORY_TAGS = new Set([
  "adr",
  "audit",
  "exec",
  "index",
  "plan",
  "reference",
  "research",
]);

/** Strip a leading `#` and surrounding whitespace from one tag token. */
export function normalizeTag(raw: string): string {
  return raw.replace(/^#/, "").trim();
}

/** Split a `tags` draft string into bare (no `#`) tag tokens. */
export function splitTags(value: string): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/[,\s]+/)
    .map(normalizeTag)
    .filter((tag) => tag.length > 0);
}

/** The directory tag of a document, or null when none is present. */
export function directoryTagOf(tags: string): string | null {
  for (const tag of splitTags(tags)) {
    if (VAULT_DIRECTORY_TAGS.has(tag)) return tag;
  }
  return null;
}

/** The feature tag of a document (the one non-directory tag), or null. */
export function featureTagOf(tags: string): string | null {
  for (const tag of splitTags(tags)) {
    if (!VAULT_DIRECTORY_TAGS.has(tag)) return tag;
  }
  return null;
}

/** Rebuild the `tags` draft string with a new feature tag, PRESERVING the existing
 *  directory tag. Passing a null/empty feature drops the feature, leaving just the
 *  directory tag. Both tags are emitted in the canonical `#tag` form. */
export function withFeatureTag(tags: string, feature: string | null): string {
  const parts: string[] = [];
  const dir = directoryTagOf(tags);
  if (dir) parts.push(`#${dir}`);
  const normalized = feature ? normalizeTag(feature) : "";
  if (normalized.length > 0) parts.push(`#${normalized}`);
  return parts.join(", ");
}
