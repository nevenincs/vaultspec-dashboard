/**
 * Token parity check (plan W01.P02.S10).
 *
 * Proves the DTCG-generated color CSS (`src/styles.generated.css`) is equivalent to the
 * committed hand-authored color tier in `src/styles.css` — the gate that must pass before
 * the canonical flip (W01.P03).
 *
 * Parity is checked on RESOLVED VALUES, not bytes: each color custom property is resolved
 * through its var() chain to a final literal (oklch()/#hex) per theme, and the committed
 * and generated literals are compared. This is stronger than byte-matching — it proves the
 * two stylesheets render identically — and it tolerates the hand-authored file's harmless
 * indirection quirks (e.g. a token pinned to a primitive in one block and routed via the
 * semantic tier in another, which resolve to the same color).
 *
 * Run: `node scripts/token-parity.ts` (exit 0 = parity holds; exit 1 = mismatch).
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "src");

type Scope = Map<string, string>; // var name -> raw value string
type Scopes = { base: Scope; light: Scope; dark: Scope; hc: Scope };

const COLOR_PREFIXES = ["--primitive-", "--semantic-", "--color-"];
const isColorVar = (name: string): boolean =>
  COLOR_PREFIXES.some((p) => name.startsWith(p));

/** Strip CSS comments so declaration scanning is clean. */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Extract the body of the first `{...}` following a header match (balanced). */
function blockBody(css: string, headerRe: RegExp): string | null {
  const m = headerRe.exec(css);
  if (!m) return null;
  const start = css.indexOf("{", m.index);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(start + 1, i);
    }
  }
  return null;
}

/** Parse `--name: value;` declarations from a block body into a scope map. */
function parseDecls(body: string | null): Scope {
  const scope: Scope = new Map();
  if (!body) return scope;
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    scope.set(m[1].trim(), m[2].trim());
  }
  return scope;
}

/** Read committed styles.css scopes: @theme static -> base; [data-theme] blocks. */
function readCommitted(): Scopes {
  const css = stripComments(readFileSync(join(srcDir, "styles.css"), "utf8"));
  return {
    base: parseDecls(blockBody(css, /@theme\s+static/)),
    light: parseDecls(blockBody(css, /\[data-theme="light"\]/)),
    dark: parseDecls(blockBody(css, /\[data-theme="dark"\]/)),
    hc: parseDecls(blockBody(css, /\[data-theme="high-contrast"\]/)),
  };
}

/** Read generated styles.generated.css scopes: :root -> base; [data-theme] blocks. */
function readGenerated(): Scopes {
  const css = stripComments(readFileSync(join(srcDir, "styles.generated.css"), "utf8"));
  return {
    base: parseDecls(blockBody(css, /:root/)),
    light: parseDecls(blockBody(css, /\[data-theme="light"\]/)),
    dark: parseDecls(blockBody(css, /\[data-theme="dark"\]/)),
    hc: parseDecls(blockBody(css, /\[data-theme="high-contrast"\]/)),
  };
}

/** Resolve a var() chain to a terminal literal, checking theme scope then base. */
function resolve(name: string, theme: Scope, base: Scope, seen = new Set<string>()): string {
  if (seen.has(name)) throw new Error(`var cycle at ${name}`);
  seen.add(name);
  const raw = theme.get(name) ?? base.get(name);
  if (raw === undefined) return `<undefined:${name}>`;
  const varMatch = /^var\((--[a-z0-9-]+)\)$/i.exec(raw);
  if (varMatch) return resolve(varMatch[1], theme, base, seen);
  return raw;
}

function normalize(v: string): string {
  return v.replace(/\s+/g, " ").trim().toLowerCase();
}

function main(): void {
  const committed = readCommitted();
  const generated = readGenerated();

  const themes: { key: keyof Omit<Scopes, "base">; label: string }[] = [
    { key: "light", label: "light" },
    { key: "dark", label: "dark" },
    { key: "hc", label: "high-contrast" },
  ];

  const mismatches: string[] = [];
  let compared = 0;

  // The consumer-facing public surface is the contract that must not change.
  const publicVars = [...committed.base.keys()].filter(
    (n) => n.startsWith("--color-") && isColorVar(n),
  );

  for (const { key, label } of themes) {
    for (const name of publicVars) {
      const c = normalize(resolve(name, committed[key], committed.base));
      const g = normalize(resolve(name, generated[key], generated.base));
      compared++;
      if (c !== g) mismatches.push(`[${label}] ${name}: committed=${c} generated=${g}`);
    }
  }

  console.log(
    `token-parity: compared ${compared} resolved public color values across 3 themes`,
  );
  if (mismatches.length) {
    console.error(`\nPARITY MISMATCH (${mismatches.length}):`);
    for (const m of mismatches) console.error("  " + m);
    process.exit(1);
  }
  console.log("PARITY OK — generated color tier resolves identically to styles.css.");
}

main();
