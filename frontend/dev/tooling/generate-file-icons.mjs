#!/usr/bin/env node
// File-type icon subset generator (code-tree-legibility ADR D1/D8).
//
// The code file tree renders colored per-type marks from `material-icon-theme`,
// the one pinned file-icon library. That package ships ~1250 SVGs and a manifest
// with ~1378 extension and ~2131 filename mappings; shipping all of it to render
// a rail is absurd, and the app must not FETCH icons at runtime (the visual
// review desk is hermetically network-inert, and the served SPA has a strict
// CSP). So this script bakes a TREE-SHAKEN SUBSET into one generated module:
// the SVG bodies are inlined as strings, and the extension/filename lookup comes
// from the package's OWN `generateManifest()` mapping rather than a hand-authored
// table that would drift from the library.
//
//   Regenerate:  node dev/tooling/generate-file-icons.mjs
//   Output:      src/app/left/fileIcons.generated.ts
//
// Regenerate after bumping the `material-icon-theme` pin in package.json, or
// after editing the SUBSET lists below; then run `npm run format` over the
// output. The generated module is committed — the build never runs this script.
//
// WHAT IS IN THE SUBSET: the extensions and filenames actually present in this
// repository's population (surveyed with `git ls-files`), plus the mainstream
// languages, config formats, and asset types any browsed repository is likely to
// contain. The list is deliberately CURATED, not derived from the manifest's full
// key set: the mapping keys are cheap, but every distinct icon they resolve to is
// bundled bytes. Add a key here when a real population needs it.
//
// WHAT IS NOT: folder icons. Directories keep the shared Phosphor folder mark —
// the sanctioned exception (ADR D2) covers colored file-TYPE marks, and a generic
// folder is not a type. The chevron already carries open/closed.

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(here, "..", "..");
const packageRoot = join(frontendRoot, "node_modules", "material-icon-theme");
const outputPath = join(frontendRoot, "src", "app", "left", "fileIcons.generated.ts");

const { generateManifest } = require(join(packageRoot, "dist", "module", "index.cjs"));
const { version } = require(join(packageRoot, "package.json"));

// Extensions worth an icon. Grouped by why they are here so the next editor can
// tell a repo-population entry from a general-audience one.
const EXTENSIONS = [
  // This repository's own population, by file count.
  "md",
  "ts",
  "tsx",
  "rs",
  "json",
  "toml",
  "svg",
  "mjs",
  "py",
  "yml",
  "yaml",
  "html",
  "css",
  "png",
  "js",
  "cjs",
  "mts",
  "lock",
  "sh",
  "ps1",
  "txt",
  // Mainstream languages a browsed repository is likely to hold.
  "go",
  "java",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "rb",
  "php",
  "swift",
  "kt",
  "lua",
  "scala",
  "dart",
  "ex",
  "r",
  "pl",
  "sql",
  "jsx",
  // Web and styling beyond the above.
  "scss",
  "less",
  "vue",
  "svelte",
  "astro",
  // Config, data, and infrastructure.
  "xml",
  "ini",
  "cfg",
  "conf",
  "env",
  "properties",
  "gradle",
  "tf",
  "proto",
  "graphql",
  "csv",
  "bat",
  // Assets and binaries.
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "pdf",
  "zip",
  "tar",
  "gz",
  "woff2",
  "ttf",
  "mp4",
  "mp3",
  "wasm",
  "exe",
  "dll",
];

// Filenames that map to a distinct icon regardless of extension. The manifest
// keys these exactly (lowercased), so the resolver lowercases before lookup.
const FILENAMES = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "cargo.toml",
  "cargo.lock",
  "justfile",
  "makefile",
  "dockerfile",
  "docker-compose.yml",
  "license",
  "readme.md",
  "changelog.md",
  "contributing.md",
  ".gitignore",
  ".gitattributes",
  ".env",
  ".editorconfig",
  ".prettierrc",
  "eslint.config.js",
  "vite.config.ts",
  "pyproject.toml",
  "uv.lock",
  "go.mod",
  "requirements.txt",
  ".npmrc",
];

const manifest = generateManifest();

/** Resolve one manifest key to its icon id, or null when the library maps it to
 *  nothing (a key we listed that the library has no opinion about). */
function resolve(table, key) {
  const id = table[key];
  return typeof id === "string" && id.length > 0 ? id : null;
}

// The generic fallback: the library's own `file` default, used for an unmapped
// extension AND whenever the icon setting is off.
const GENERIC = manifest.file;
if (typeof GENERIC !== "string" || GENERIC.length === 0) {
  throw new Error("material-icon-theme manifest has no default `file` icon");
}

const byExtension = new Map();
const byFilename = new Map();
const wanted = new Set([GENERIC]);
const unmapped = [];

for (const ext of EXTENSIONS) {
  const id = resolve(manifest.fileExtensions, ext);
  if (id === null) {
    unmapped.push(`extension .${ext}`);
    continue;
  }
  // An extension whose icon IS the generic fallback earns no mapping entry: the
  // resolver already falls back, so the row renders identically with less table.
  if (id === GENERIC) continue;
  byExtension.set(ext, id);
  wanted.add(id);
}

for (const name of FILENAMES) {
  const id = resolve(manifest.fileNames, name);
  if (id === null) {
    unmapped.push(`filename ${name}`);
    continue;
  }
  if (id === GENERIC) continue;
  byFilename.set(name, id);
  wanted.add(id);
}

/** Read one icon's SVG and split it into its viewBox and inner body. The wrapper
 *  is dropped: the React component owns sizing, role, and class, exactly as the
 *  domain-mark chrome components already do. */
function readIcon(id) {
  const raw = readFileSync(join(packageRoot, "icons", `${id}.svg`), "utf8").trim();
  const open = raw.match(/^<svg\b([^>]*)>/);
  if (!open) throw new Error(`${id}.svg does not open with an <svg> element`);
  const viewBox = open[1].match(/viewBox="([^"]+)"/);
  if (!viewBox) throw new Error(`${id}.svg has no viewBox`);
  if (!raw.endsWith("</svg>")) throw new Error(`${id}.svg does not close cleanly`);
  const body = raw.slice(open[0].length, -"</svg>".length).trim();
  return {
    viewBox: viewBox[1],
    svgBody: namespaceIds(body, id).replace(/\s+/g, " "),
  };
}

/** Inline SVGs share ONE document id space, and this library names its gradient
 *  and clip-path ids `a`, `b`, ... per file. Two inlined icons would then both
 *  define `#a` and every `url(#a)` in the document would resolve to whichever
 *  rendered first — a wrong-colored icon that no test would obviously catch. So
 *  every internal id is rewritten to an icon-scoped one, along with each
 *  reference to it. */
function namespaceIds(body, iconId) {
  const ids = [...body.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  if (ids.length === 0) return body;
  let out = body;
  for (const local of [...new Set(ids)].sort((a, b) => b.length - a.length)) {
    const scoped = `mit-${iconId}-${local}`;
    const quoted = local.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out
      .replace(new RegExp(`( id=")${quoted}(")`, "g"), `$1${scoped}$2`)
      .replace(new RegExp(`(url\\(#)${quoted}(\\))`, "g"), `$1${scoped}$2`)
      .replace(new RegExp(`((?:xlink:)?href="#)${quoted}(")`, "g"), `$1${scoped}$2`);
  }
  if (/(?:url\(#|href="#)(?!mit-)/.test(out)) {
    throw new Error(`${iconId}.svg references an id this script did not rewrite`);
  }
  return out;
}

const defs = new Map();
for (const id of [...wanted].sort()) defs.set(id, readIcon(id));

const bytes = [...defs.values()].reduce(
  (total, def) => total + def.svgBody.length + def.viewBox.length,
  0,
);

function literal(value) {
  return JSON.stringify(value);
}

function entries(map) {
  return [...map]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, id]) => `  ${literal(key)}: ${literal(id)},`)
    .join("\n");
}

const source = `// GENERATED FILE - DO NOT EDIT BY HAND.
//
// Tree-shaken file-type icon subset baked from \`material-icon-theme@${version}\`
// (MIT; the package's LICENSE ships in node_modules and is the one pinned
// file-icon source per the code-tree-legibility ADR D1/D8).
//
// Regenerate with:  node dev/tooling/generate-file-icons.mjs
// The subset policy - which extensions and filenames earn an icon - lives in
// that script, together with the reason each group is listed.
//
// Every mapping below comes from the library's own \`generateManifest()\` output,
// never a hand-authored table, so a library remap arrives on regeneration. The
// SVG bodies are INLINED (no runtime fetch: the review desk is network-inert and
// the served SPA runs under a strict CSP), stripped of their <svg> wrapper -
// sizing, role, and class belong to the rendering component. Their baked palette
// is the imported family's own and is the ONE sanctioned exception to the
// token-only color law, scoped to code file-tree rows.
//
// ${defs.size} icons, ${bytes} bytes of inlined SVG.

/** One inlined icon: the source viewBox and the wrapper-free element body. */
export interface FileIconDef {
  readonly viewBox: string;
  readonly svgBody: string;
}

/** The library's generic file mark - the fallback for an unmapped path. */
export const GENERIC_FILE_ICON = ${literal(GENERIC)};

/** Lowercased final extension (no dot) to icon id. An extension absent here has
 *  no distinct icon and resolves to the generic mark. */
export const FILE_ICON_BY_EXTENSION: Readonly<Record<string, string>> = {
${entries(byExtension)}
};

/** Lowercased whole filename to icon id, checked BEFORE the extension so
 *  \`package.json\` beats \`.json\`. */
export const FILE_ICON_BY_FILENAME: Readonly<Record<string, string>> = {
${entries(byFilename)}
};

export const FILE_ICON_DEFS: Readonly<Record<string, FileIconDef>> = {
${[...defs]
  .map(
    ([id, def]) =>
      `  ${literal(id)}: { viewBox: ${literal(def.viewBox)}, svgBody: ${literal(def.svgBody)} },`,
  )
  .join("\n")}
};
`;

writeFileSync(outputPath, source);

console.log(
  `file-icons: ${defs.size} icons (${bytes} bytes inlined), ` +
    `${byExtension.size} extension + ${byFilename.size} filename mappings ` +
    `from material-icon-theme@${version}`,
);
if (unmapped.length > 0) {
  console.log(`file-icons: no library mapping for ${unmapped.join(", ")}`);
}
