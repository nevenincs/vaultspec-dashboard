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

export function compareAllowlist(findings, allowlist) {
  const current = new Map(findings.map((finding) => [finding.id, finding]));
  const allowed = new Map(allowlist.map((entry) => [entry.id, entry]));
  return {
    metadataMismatches: findings.filter((finding) => {
      const entry = allowed.get(finding.id);
      return (
        entry !== undefined &&
        (entry.rule !== finding.code || entry.path !== finding.path)
      );
    }),
    newFindings: findings.filter((finding) => !allowed.has(finding.id)),
    stale: allowlist.filter((entry) => !current.has(entry.id)),
  };
}

export function baselineEntries(findings) {
  return findings
    .map(({ id, code, path }) => ({ id, path, rule: code }))
    .sort(
      (a, b) =>
        compareText(a.path, b.path) ||
        compareText(a.rule, b.rule) ||
        compareText(a.id, b.id),
    );
}

export function reportCounts(findings) {
  const counts = new Map();
  for (const finding of findings) {
    counts.set(finding.code, (counts.get(finding.code) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => compareText(a, b));
}
