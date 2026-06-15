/**
 * Pure CSS line-diff used by the token drift gate (plan W01.P05). Dependency-free so it
 * is importable by both the Node runtime script (token-drift-check.ts) and the vitest
 * suite without pulling the Style Dictionary build chain.
 */

function lines(s: string): string[] {
  return s.replace(/\r\n/g, "\n").split("\n");
}

/**
 * Compare committed vs freshly-generated CSS, returning human-readable diff descriptions
 * (empty array = in sync). Newline-normalized, so CRLF/LF differences are not drift.
 */
export function diffCss(committed: string, fresh: string): string[] {
  if (fresh.replace(/\r\n/g, "\n") === committed.replace(/\r\n/g, "\n")) return [];
  const a = lines(committed);
  const b = lines(fresh);
  const diffs: string[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max && diffs.length < 20; i++) {
    if (a[i] !== b[i]) {
      diffs.push(
        `  L${i + 1}\n    committed: ${a[i] ?? "<none>"}\n    fresh:     ${b[i] ?? "<none>"}`,
      );
    }
  }
  return diffs;
}
