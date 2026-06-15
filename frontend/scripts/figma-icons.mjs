// figma-icons.mjs — extract the Lucide (structural chrome) + Phosphor (domain)
// glyphs the dashboard actually imports, as flat SVG strings, into
// `figma/icons.json`. This completes the Lucide/Phosphor side of the Figma
// foundation seed (the in-house domain marks live in src/scene/field/marks.ts
// and are seeded separately). One-way, code → Figma; Figma is never canonical.
//
// Lucide: each icon module exports `__iconNode` = [[tag, attrs], …] on a 24 grid,
//   stroked (fill none, width 2, round caps/joins).
// Phosphor: each def module default-exports a Map<weight, ReactElement>; we read
//   the "regular" weight and serialize its shape elements on the 256 grid (filled).
//
// Run: node scripts/figma-icons.mjs   (from frontend/)

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const NM = path.join(ROOT, "node_modules");

// --- the used icon inventory (kept in sync with `git grep` of imports) --------
// Lucide import-name → kebab module file.
const LUCIDE = {
  ExternalLink: "external-link", X: "x", CornerDownLeft: "corner-down-left",
  ChevronDown: "chevron-down", ChevronRight: "chevron-right", ChevronUp: "chevron-up",
  Filter: "filter", FileWarning: "file-warning", Crosshair: "crosshair",
  Minimize2: "minimize-2", Maximize2: "maximize-2", Star: "star", GitBranch: "git-branch",
  FolderPlus: "folder-plus", TriangleAlert: "triangle-alert", AlertTriangle: "triangle-alert",
  Search: "search", ListTree: "list-tree", Locate: "locate", Play: "play",
  RotateCcw: "rotate-ccw", CalendarDays: "calendar-days", Scan: "scan",
  ZoomIn: "zoom-in", ZoomOut: "zoom-out", HelpCircle: "circle-help",
  Brain: "brain", ScanSearch: "scan-search", Dot: "dot", MoveUp: "move-up",
  MoveDown: "move-down", Minus: "minus", Plus: "plus", Settings2: "settings-2",
  Maximize: "maximize", Minimize: "minimize", PanelLeft: "panel-left",
  Database: "database", Eye: "eye", ShieldCheck: "shield-check",
  CircleSlash: "circle-slash", PanelRight: "panel-right",
  Network: "network", Sparkles: "sparkles",
  Square: "square", RefreshCw: "refresh-cw", Loader2: "loader-2", LoaderCircle: "loader-circle",
};

// Phosphor import-name → def file basename.
const PHOSPHOR = {
  Books: "Books", TreeStructure: "TreeStructure", Diamond: "Diamond",
  ClipboardText: "ClipboardText", Stack: "Stack", SealCheck: "SealCheck",
  BookOpen: "BookOpen", ListBullets: "ListBullets", Pencil: "Pencil",
  FileDashed: "FileDashed", Folder: "Folder", File: "File",
};

const isFragment = (t) =>
  typeof t === "symbol" && String(t).includes("react.fragment");

/** Serialize a React element tree of svg shapes to a flat element string. */
function serialize(node) {
  if (node == null || node === false) return "";
  if (Array.isArray(node)) return node.map(serialize).join("");
  if (typeof node !== "object") return "";
  const { type, props = {} } = node;
  if (isFragment(type)) return serialize(props.children);
  if (typeof type !== "string") return serialize(props.children); // unknown wrapper
  const attrs = Object.entries(props)
    .filter(([k]) => k !== "children" && k !== "key" && k !== "ref")
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  const inner = serialize(props.children);
  return inner ? `<${type} ${attrs}>${inner}</${type}>` : `<${type} ${attrs}/>`;
}

async function importFile(rel) {
  const abs = path.join(NM, rel);
  if (!fs.existsSync(abs)) return null;
  return import(pathToFileURL(abs).href);
}

const out = {};
const missing = [];

// Resolve a lucide icon module, following `export { default } from './x.mjs'`
// alias chains (lucide v1 renamed many icons and left aliases behind).
async function lucideIconNode(kebab, depth = 0) {
  if (depth > 4) return null;
  const rel = `lucide-react/dist/esm/icons/${kebab}.mjs`;
  const mod = await importFile(rel);
  if (mod?.__iconNode) return mod.__iconNode;
  const txt = fs.readFileSync(path.join(NM, rel), "utf8");
  const m = txt.match(/from ['"]\.\/([\w-]+)\.mjs['"]/);
  return m ? lucideIconNode(m[1], depth + 1) : null;
}

// LUCIDE — 24 grid, stroked
for (const [name, kebab] of Object.entries(LUCIDE)) {
  if (out[name]) continue;
  const iconNode = await lucideIconNode(kebab);
  if (!iconNode) { missing.push(`lucide:${name}(${kebab})`); continue; }
  const inner = iconNode
    .map(([tag, attrs]) =>
      `<${tag} ${Object.entries(attrs)
        .filter(([k]) => k !== "key")
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ")}/>`,
    )
    .join("");
  out[name] = {
    family: "lucide", grid: 24,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`,
  };
}

// PHOSPHOR — 256 grid, filled (regular weight)
for (const [name, file] of Object.entries(PHOSPHOR)) {
  if (out[name]) continue;
  const mod = await importFile(`@phosphor-icons/react/dist/defs/${file}.es.js`);
  const map = mod?.default;
  if (!map || typeof map.get !== "function") { missing.push(`phosphor:${name}`); continue; }
  const reg = map.get("regular");
  if (!reg) { missing.push(`phosphor:${name}(no-regular)`); continue; }
  const inner = serialize(reg.props?.children ?? reg);
  out[name] = {
    family: "phosphor", grid: 256,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor">${inner}</svg>`,
  };
}

const dest = path.join(ROOT, "figma", "icons.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${Object.keys(out).length} icons → figma/icons.json`);
if (missing.length) console.log(`MISSING (${missing.length}): ${missing.join(", ")}`);
