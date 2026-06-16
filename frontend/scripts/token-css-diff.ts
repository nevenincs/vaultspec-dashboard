/**
 * Pure, dependency-free helpers for the token drift gate (plan W01.P05). Importable by
 * both the Node runtime script (token-drift-check.ts) and the vitest suite without pulling
 * the Style Dictionary build chain.
 *
 * Comparison is formatting-agnostic: the managed CSS regions are parsed into scoped
 * declaration maps ((selector|name) -> value) and compared by value, so prettier owning
 * the file's whitespace never registers as drift — only an actual token value change does.
 */

/**
 * Parse `--name: value;` declarations, tracking the enclosing `[data-theme="x"]` scope.
 *
 * Declarations are coalesced across wrapped lines (prettier wraps long values such as
 * font-family stacks and layered shadows over several lines): a declaration is
 * accumulated from its `--name:` opener until the terminating `;`, so the comparison
 * stays formatting-agnostic for multi-line as well as single-line values.
 */
export function parseScopedDecls(region: string, defaultScope: string): Map<string, string> {
  const out = new Map<string, string>();
  let scope = defaultScope;
  let pendingName: string | null = null;
  let pendingValue = "";

  const flush = () => {
    if (pendingName === null) return;
    const value = pendingValue.replace(/;[\s\S]*$/, "").replace(/\s+/g, " ").trim().toLowerCase();
    out.set(`${scope}|${pendingName}`, value);
    pendingName = null;
    pendingValue = "";
  };

  for (const rawLine of region.split("\n")) {
    const line = rawLine.trim();

    if (pendingName !== null) {
      pendingValue += " " + line;
      if (line.includes(";")) flush();
      continue;
    }

    const sel = /^(\[data-theme="[^"]+"\]|:root)\s*\{/.exec(line);
    if (sel) {
      scope = sel[1];
      continue;
    }
    if (line === "}") {
      scope = defaultScope;
      continue;
    }
    const decl = /^(--[a-z0-9-]+)\s*:\s*(.*)$/i.exec(line);
    if (decl) {
      pendingName = decl[1];
      pendingValue = decl[2];
      if (decl[2].includes(";")) flush();
    }
  }
  flush();
  return out;
}

/** Compare two scoped declaration maps, returning human-readable mismatch descriptions. */
export function compareDecls(
  committed: Map<string, string>,
  fresh: Map<string, string>,
): string[] {
  const diffs: string[] = [];
  const keys = new Set([...committed.keys(), ...fresh.keys()]);
  for (const key of keys) {
    const c = committed.get(key);
    const f = fresh.get(key);
    if (c !== f) diffs.push(`  ${key}: committed=${c ?? "<missing>"} fresh=${f ?? "<missing>"}`);
  }
  return diffs.sort();
}

/** Extract the text between a region's begin/end markers (exclusive of the markers). */
export function extractRegion(css: string, begin: string, end: string): string {
  const b = css.indexOf(begin);
  const e = css.indexOf(end);
  if (b < 0 || e < 0 || e < b) throw new Error(`markers not found: ${begin} .. ${end}`);
  return css.slice(b + begin.length, e);
}
