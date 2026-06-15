/**
 * Figma export generator (plan W01.P04.S18).
 *
 * Emits `tokens/figma/tokens.json` in Tokens Studio format from the DTCG source. Figma
 * cannot store OKLCH, so every value is resolved to sRGB hex (culori; verified to match
 * the hand-authored scene hex). Structure maps to the ADR's two Figma collections:
 *   - set `primitives`            -> Primitives collection (one mode), hex values.
 *   - sets `semantic-{light,dark,high-contrast}` -> Semantic collection (three modes),
 *     aliasing primitives via `{primitive.x.y}` where the source aliases a primitive,
 *     else a resolved hex.
 * A `$themes` array binds each mode so Tokens Studio's "Create Variables" produces the
 * Semantic collection with Light/Dark/High Contrast modes.
 *
 * Run: `node scripts/figma-export.ts` (npm run tokens:figma). One-way, code -> Figma.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { formatHex, oklch as toOklch } from "culori";
import StyleDictionary from "style-dictionary";
import { isAliasRef, type DtcgColorValue } from "./sd-transforms.ts";

const here = dirname(fileURLToPath(import.meta.url));
const tokensDir = join(here, "..", "tokens");
const outDir = join(tokensDir, "figma");

type Leaf = { path: string[]; original: { $value: DtcgColorValue } };

const PRIMITIVES = join(tokensDir, "primitives.tokens.json");
const SEMANTIC = join(tokensDir, "semantic.tokens.json");
const DARK = join(tokensDir, "themes", "dark.tokens.json");
const HC = join(tokensDir, "themes", "high-contrast.tokens.json");

async function tokensFor(sources: string[]): Promise<Leaf[]> {
  const sd = new StyleDictionary({
    source: sources,
    platforms: { noop: { transformGroup: "css", files: [] } },
    log: { verbosity: "silent", warnings: "disabled" },
  });
  return (await sd.getPlatformTokens("noop")).allTokens as unknown as Leaf[];
}

/** Resolve a DTCG color value to a Tokens Studio value: an alias ref or an sRGB hex. */
function toFigmaValue(raw: DtcgColorValue): string {
  if (isAliasRef(raw)) return raw; // keep {primitive.x.y} alias
  if (typeof raw === "string") return raw;
  if (raw.colorSpace === "srgb" && raw.hex) return raw.hex.toLowerCase();
  if (raw.colorSpace === "oklch" && raw.components) {
    const [l, c, h] = raw.components;
    return formatHex(toOklch({ mode: "oklch", l, c, h })).toLowerCase();
  }
  if (raw.hex) return raw.hex.toLowerCase();
  throw new Error(`unconvertible color: ${JSON.stringify(raw)}`);
}

/** Nest {value,type} leaves into an object by dotted path. */
function nest(tokens: Leaf[], keep: (p: string) => boolean): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const t of tokens) {
    const path = t.path.join(".");
    if (!keep(path)) continue;
    let node = root;
    for (let i = 0; i < t.path.length - 1; i++) {
      const k = t.path[i];
      node[k] = (node[k] as Record<string, unknown>) ?? {};
      node = node[k] as Record<string, unknown>;
    }
    node[t.path[t.path.length - 1]] = { value: toFigmaValue(t.original.$value), type: "color" };
  }
  return root;
}

async function build(): Promise<void> {
  const isPrimitive = (p: string) => p.startsWith("primitive.");
  const isSurface = (p: string) => p.startsWith("semantic.") || p.startsWith("public.");

  const base = await tokensFor([PRIMITIVES, SEMANTIC]);
  const dark = await tokensFor([PRIMITIVES, SEMANTIC, DARK]);
  const hc = await tokensFor([PRIMITIVES, SEMANTIC, HC]);

  const file = {
    primitives: nest(base, isPrimitive),
    "semantic-light": nest(base, isSurface),
    "semantic-dark": nest(dark, isSurface),
    "semantic-high-contrast": nest(hc, isSurface),
    $themes: [
      theme("Light", "semantic-light"),
      theme("Dark", "semantic-dark"),
      theme("High Contrast", "semantic-high-contrast"),
    ],
    $metadata: {
      tokenSetOrder: ["primitives", "semantic-light", "semantic-dark", "semantic-high-contrast"],
    },
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "tokens.json"), JSON.stringify(file, null, 2) + "\n", "utf8");
  console.log(`wrote ${join(outDir, "tokens.json")}`);
}

function theme(name: string, semanticSet: string) {
  return {
    name,
    group: "Semantic",
    selectedTokenSets: { primitives: "source", [semanticSet]: "enabled" },
  };
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
