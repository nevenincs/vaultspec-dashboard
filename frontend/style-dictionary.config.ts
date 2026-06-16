/**
 * Style Dictionary build for the vaultspec-dashboard color framework (plan W01.P02/P03).
 *
 * Canonical source: the DTCG token files under `tokens/`. This build regenerates the
 * COLOR portion of `src/styles.css` in place, inside two generator-managed marker regions
 * (the repo's `vaultspec:generated:*` discipline) so the colors stay inside Tailwind's
 * `@theme static` block (required for utility generation) while the non-color tokens,
 * shadows, keyframes, and contrast proof remain hand-authored around them:
 *
 *   @theme static {            ... vaultspec:generated:colors:begin/end (primitives +
 *                                  semantic + public surface) ... hand-authored type/
 *                                  spacing/shadow/radius/motion ...
 *   @layer base {              ... vaultspec:generated:themes:begin/end ([data-theme]
 *                                  color remaps) ... hand-authored shadow remaps, body ...
 *
 * Run: `node style-dictionary.config.ts` (rewrites the managed regions, then the caller
 * runs prettier). Node 22.6+ strips the TS types at runtime.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import StyleDictionary from "style-dictionary";
import { cssValue, defaultCssVar, type DtcgColorValue } from "./scripts/sd-transforms.ts";

const here = dirname(fileURLToPath(import.meta.url));
const tokensDir = join(here, "tokens");
export const STYLES_FILE = join(here, "src", "styles.css");

type Leaf = { path: string[]; original: { $value: DtcgColorValue } };

const PRIMITIVES = join(tokensDir, "primitives.tokens.json");
const SEMANTIC = join(tokensDir, "semantic.tokens.json");
const DARK = join(tokensDir, "themes", "dark.tokens.json");
const HC = join(tokensDir, "themes", "high-contrast.tokens.json");

const TYPE = join(tokensDir, "type.tokens.json");
const RADIUS = join(tokensDir, "radius.tokens.json");
const ELEVATION = join(tokensDir, "elevation.tokens.json");
const SPACING = join(tokensDir, "spacing.tokens.json");

export const MARKERS = {
  colors: {
    begin: "/* vaultspec:generated:colors:begin */",
    end: "/* vaultspec:generated:colors:end */",
  },
  themes: {
    begin: "/* vaultspec:generated:themes:begin */",
    end: "/* vaultspec:generated:themes:end */",
  },
  foundation: {
    begin: "/* vaultspec:generated:foundation:begin */",
    end: "/* vaultspec:generated:foundation:end */",
  },
};

function leafPaths(obj: any, prefix: string[] = [], acc = new Set<string>()): Set<string> {
  for (const k of Object.keys(obj)) {
    if (k.startsWith("$")) continue;
    const v = obj[k];
    if (v && typeof v === "object" && "$value" in v) acc.add([...prefix, k].join("."));
    else if (v && typeof v === "object") leafPaths(v, [...prefix, k], acc);
  }
  return acc;
}

/** The token paths that appear in a [data-theme] block (== the override files). */
const THEMED = leafPaths(JSON.parse(readFileSync(DARK, "utf8")));

function walkVars(obj: any, prefix: string[], map: Map<string, string>): void {
  for (const k of Object.keys(obj)) {
    if (k.startsWith("$")) continue;
    const v = obj[k];
    const path = [...prefix, k];
    if (v && typeof v === "object" && "$value" in v) {
      const pinned = v.$extensions?.["com.vaultspec.css"]?.var;
      map.set(path.join("."), pinned ?? defaultCssVar(path.join(".")));
    } else if (v && typeof v === "object") {
      walkVars(v, path, map);
    }
  }
}

function buildVarMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of [PRIMITIVES, SEMANTIC]) {
    walkVars(JSON.parse(readFileSync(file, "utf8")), [], map);
  }
  return map;
}

const VAR_OF = buildVarMap();
const varForPath = (p: string): string => {
  const v = VAR_OF.get(p);
  if (!v) throw new Error(`no css var known for token path ${p}`);
  return v;
};

async function tokensFor(sources: string[]): Promise<Leaf[]> {
  const sd = new StyleDictionary({
    source: sources,
    platforms: { noop: { transformGroup: "css", files: [] } },
    log: { verbosity: "silent", warnings: "disabled" },
  });
  const dict = await sd.getPlatformTokens("noop");
  return dict.allTokens as unknown as Leaf[];
}

/** Emit `name: value;` declaration lines for tokens kept by the predicate, at `indent`. */
function declLines(tokens: Leaf[], keep: (path: string) => boolean, indent: string): string {
  const out: string[] = [];
  for (const t of tokens) {
    const path = t.path.join(".");
    if (!keep(path)) continue;
    const name = VAR_OF.get(path) ?? defaultCssVar(path);
    out.push(`${indent}${name}: ${cssValue(t.original.$value, varForPath)};`);
  }
  return out.join("\n");
}

/** Build the two managed-region bodies (without the marker comments). */
export async function generateRegions(): Promise<{ colors: string; themes: string }> {
  const base = await tokensFor([PRIMITIVES, SEMANTIC]);
  const dark = await tokensFor([PRIMITIVES, SEMANTIC, DARK]);
  const hc = await tokensFor([PRIMITIVES, SEMANTIC, HC]);

  const colors = declLines(base, () => true, "  ");

  const block = (selector: string, toks: Leaf[]): string =>
    `  ${selector} {\n${declLines(toks, (p) => THEMED.has(p), "    ")}\n  }`;

  const themes = [
    block('[data-theme="light"]', base),
    block('[data-theme="dark"]', dark),
    block('[data-theme="high-contrast"]', hc),
  ].join("\n\n");

  return { colors, themes };
}

/* ---------------------------------------------------------------------------
   NON-COLOR FOUNDATION (figma-parity-reconciliation W01.P01.S05).

   The Figma-binding type, radius, elevation, and spacing families are authored as
   DTCG under tokens/{type,radius,elevation,spacing}.tokens.json and generated into a
   third managed region (vaultspec:generated:foundation:*) inside @theme static. These
   are theme-INVARIANT scalar values (no oklch / hex / per-theme remap), so they are
   serialized directly from the raw $value (dimension/fontWeight/fontFamily/shadow);
   the per-theme SHADOW remaps stay hand-authored (README scope boundary).

   Emitted custom-property names (the canonical Figma-bound foundation surface):
     --font-fg-sans / --font-fg-mono
     --text-fg-<role> / --text-fg-<role>--line-height / --text-fg-<role>--weight
     --radius-fg-<step>
     --shadow-fg-<level>
     --spacing-fg-<step>
   The legacy --text-* / --radius-vs-* / --shadow-* / --spacing-vs-* names remain
   hand-authored as deprecated aliases onto these (S08-S10) until the W02/W03 rewrite
   cuts usages over and W04 removes the aliases.
   --------------------------------------------------------------------------- */

type NonColorLeaf = { path: string[]; value: string | number };

/** Flatten a DTCG file to leaves carrying the raw $value (non-color: scalar). */
function flatLeaves(obj: any, prefix: string[] = [], acc: NonColorLeaf[] = []): NonColorLeaf[] {
  for (const k of Object.keys(obj)) {
    if (k.startsWith("$")) continue;
    const v = obj[k];
    if (v && typeof v === "object" && "$value" in v) {
      acc.push({ path: [...prefix, k], value: v.$value as string | number });
    } else if (v && typeof v === "object") {
      flatLeaves(v, [...prefix, k], acc);
    }
  }
  return acc;
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Build the foundation region body (declaration lines, no markers), at 2-space indent. */
export function generateFoundation(): string {
  const out: string[] = [];
  const push = (name: string, value: string | number) => out.push(`  ${name}: ${value};`);

  // -- type: families, then per-role size / line-height / weight ----------------
  const type = readJson(TYPE).type;
  for (const fam of Object.keys(type.family).filter((k) => !k.startsWith("$"))) {
    push(`--font-fg-${fam}`, type.family[fam].$value);
  }
  for (const role of Object.keys(type.role).filter((k) => !k.startsWith("$"))) {
    const r = type.role[role];
    push(`--text-fg-${role}`, r.size.$value);
    push(`--text-fg-${role}--line-height`, r["line-height"].$value);
    push(`--text-fg-${role}--weight`, r.weight.$value);
  }

  // -- radius -------------------------------------------------------------------
  for (const l of flatLeaves(readJson(RADIUS).radius)) {
    push(`--radius-fg-${l.path.join("-")}`, l.value);
  }

  // -- elevation (base/light shadows; per-theme remaps stay hand-authored) -------
  for (const l of flatLeaves(readJson(ELEVATION).elevation)) {
    push(`--shadow-fg-${l.path.join("-")}`, l.value);
  }

  // -- spacing ------------------------------------------------------------------
  for (const l of flatLeaves(readJson(SPACING).spacing)) {
    push(`--spacing-fg-${l.path.join("-")}`, l.value);
  }

  return out.join("\n");
}

/** Replace the body between a region's begin/end markers in `css`. */
function spliceRegion(css: string, begin: string, end: string, body: string): string {
  const b = css.indexOf(begin);
  const e = css.indexOf(end);
  if (b < 0 || e < 0 || e < b) {
    throw new Error(`markers not found or out of order: ${begin} .. ${end}`);
  }
  return css.slice(0, b + begin.length) + "\n" + body + "\n  " + css.slice(e);
}

/** Rewrite the managed color and foundation regions of styles.css from the DTCG source. */
export async function writeStyles(): Promise<void> {
  const { colors, themes } = await generateRegions();
  const foundation = generateFoundation();
  let css = readFileSync(STYLES_FILE, "utf8");
  css = spliceRegion(css, MARKERS.colors.begin, MARKERS.colors.end, colors);
  css = spliceRegion(css, MARKERS.themes.begin, MARKERS.themes.end, themes);
  css = spliceRegion(css, MARKERS.foundation.begin, MARKERS.foundation.end, foundation);
  writeFileSync(STYLES_FILE, css, "utf8");
  console.log(`rewrote managed color + foundation regions in ${STYLES_FILE}`);
  console.log(`  themed per mode: ${THEMED.size}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeStyles().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
