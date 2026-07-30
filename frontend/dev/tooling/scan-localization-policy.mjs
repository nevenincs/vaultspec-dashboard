function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export const PRESENTATION_FIELD_NAMES = new Set([
  "accessibleName",
  "ariaLabel",
  "body",
  "cancelLabel",
  "confirmLabel",
  "checks",
  "description",
  "disabledReason",
  "emptyText",
  "errorText",
  "errors",
  "label",
  "loadingText",
  "message",
  "placeholder",
  "statusText",
  "title",
]);

export const UNSAFE_DYNAMIC_PRESENTATION_NAMES = new Set([
  "exec_node_id",
  "hash",
  "id",
  "reason",
  "sha",
  "short_hash",
]);

export function reportCounts(findings) {
  const counts = new Map();
  for (const finding of findings) {
    counts.set(finding.code, (counts.get(finding.code) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => compareText(a, b));
}
