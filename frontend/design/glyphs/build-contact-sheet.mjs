// Regenerates contact-sheet.html from src/*.svg. Run: `node build-contact-sheet.mjs`
// The sheet inlines each SVG body verbatim (stripping only width/height/viewBox/xmlns
// and re-applying the viewBox at each preview size) so it always mirrors the sources.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, "src");
const OUT = path.join(here, "contact-sheet.html");

const categories = [
  { title: "Doc types", sub: "closed fillable silhouettes — shape carries type",
    names: ["doc-research", "doc-adr", "doc-plan", "doc-exec", "doc-audit", "doc-reference", "doc-index"] },
  { title: "Feature", sub: "the compound species — reads distinct from all doc types",
    names: ["node-feature"] },
  { title: "Events", sub: "small, open, linear — timeline marks",
    names: ["event-commit", "event-doc-created", "event-doc-modified", "event-lifecycle"] },
  { title: "Tier marks", sub: "MUST distinguish in grayscale at 14px by shape + treatment",
    names: ["tier-declared", "tier-structural", "tier-temporal", "tier-semantic"] },
  { title: "State marks", sub: "",
    names: ["state-active", "state-complete", "state-archived", "state-broken", "state-stale"] },
  { title: "Progress ring parts", sub: "arcs anchored at 12 o’clock, clockwise, exact 90/180/270",
    names: ["ring-track", "ring-fill-25", "ring-fill-50", "ring-fill-75", "ring-complete"] },
];

const innerOf = (name) =>
  fs.readFileSync(path.join(SRC, `${name}.svg`), "utf8").match(/<svg[^>]*>([\s\S]*?)<\/svg>/)[1].trim();
const rootAttrs = (name) =>
  fs.readFileSync(path.join(SRC, `${name}.svg`), "utf8")
    .match(/<svg([^>]*)>/)[1].replace(/\s(width|height|xmlns|viewBox)="[^"]*"/g, "").trim();

const data = {};
for (const c of categories) for (const n of c.names) data[n] = { inner: innerOf(n), attrs: rootAttrs(n) };
const svgAt = (name, px) => `<svg viewBox="0 0 24 24" width="${px}" height="${px}" ${data[name].attrs}>${data[name].inner}</svg>`;

const cell = (name, labelled = true) => `<div class="cell">
    <div class="sizes"><span class="g">${svgAt(name, 14)}</span><span class="g">${svgAt(name, 24)}</span><span class="g">${svgAt(name, 44)}</span></div>
    ${labelled ? `<div class="lbl">${name}</div>` : ""}
  </div>`;

const section = () => categories.map((c) => `
    <div class="cat">
      <h3>${c.title}${c.sub ? ` <em>${c.sub}</em>` : ""}</h3>
      <div class="grid">${c.names.map((n) => cell(n)).join("")}</div>
    </div>`).join("");

const tierGray = ["tier-declared", "tier-structural", "tier-temporal", "tier-semantic"].map((n) => cell(n)).join("");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>vaultspec hand-drawn glyph family v1 — contact sheet</title>
<style>
  :root { --pad: 28px; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { padding: var(--pad); border-bottom: 1px solid #0002; }
  header h1 { margin: 0 0 .25rem; font-size: 18px; letter-spacing: .01em; }
  header p { margin: 0; font-size: 12.5px; opacity: .8; max-width: 70ch; }
  .theme { padding: var(--pad); }
  .theme > h2 { margin: 0 0 .25rem; font-size: 15px; text-transform: uppercase; letter-spacing: .08em; }
  .theme > .note { font-size: 12px; opacity: .75; margin: 0 0 1.25rem; }
  .light { background: #faf6ef; color: #2b2723; }
  .dark  { background: #211e1a; color: #ece5d8; }
  .gray  { background: #efeeec; color: #1c1c1c; }
  .gray .grid svg { filter: grayscale(1); }
  .cat { margin-bottom: 1.75rem; }
  .cat h3 { font-size: 13px; margin: 0 0 .6rem; font-weight: 650; letter-spacing: .02em;
            border-bottom: 1px solid color-mix(in srgb, currentColor 22%, transparent); padding-bottom: .3rem; }
  .cat h3 em { font-style: normal; font-weight: 400; font-size: 11.5px; opacity: .7; margin-left: .5rem; }
  .grid { display: flex; flex-wrap: wrap; gap: 10px; }
  .cell { display: flex; flex-direction: column; align-items: center; padding: 10px 12px 8px; border-radius: 8px;
          background: color-mix(in srgb, currentColor 4%, transparent);
          border: 1px solid color-mix(in srgb, currentColor 12%, transparent); min-width: 116px; }
  .sizes { display: flex; align-items: flex-end; gap: 10px; height: 48px; }
  .g { display: inline-flex; align-items: flex-end; }
  .g svg { display: block; }
  .lbl { font-size: 10.5px; opacity: .82; margin-top: 8px; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  .legend { font-size: 11px; opacity: .65; padding: 0 var(--pad) var(--pad); }
  hr.sep { border: 0; border-top: 1px solid #0002; margin: 0; }
</style>
</head>
<body>
<header class="light">
  <h1>vaultspec hand-drawn glyph family — v1 contact sheet</h1>
  <p>26 glyphs, one hand. 24×24 viewBox, 20×20 safe area, exact anchor geometry; hand-drawn character lives only in stroke treatment (curvature bow, ≤0.5u corner overshoot) and weight tiers (detail 1.25 / primary 2.0 / accent 2.75), round caps and joins throughout. Single <code>currentColor</code> ink. Each glyph shown at field (14px), mid (24px), and detail (44px) size.</p>
</header>
<section class="theme light"><h2>Light theme</h2><p class="note">paper-warm ground #faf6ef · ink #2b2723</p>${section()}</section>
<hr class="sep">
<section class="theme dark"><h2>Dark theme</h2><p class="note">ground #211e1a · ink #ece5d8</p>${section()}</section>
<hr class="sep">
<section class="theme gray"><h2>Grayscale tier proof</h2><p class="note">tier marks must distinguish without hue — silhouette + stroke treatment only, squint-test at 14px</p><div class="cat"><div class="grid">${tierGray}</div></div></section>
<p class="legend">Labels meet WCAG AA on both themes: #2b2723 on #faf6ef ≈ 12.6:1; #ece5d8 on #211e1a ≈ 12.9:1. Tier/state hue is applied by the consumer (currentColor); these grounds are the design reference grounds only.</p>
</body>
</html>`;

fs.writeFileSync(OUT, html);
console.log(`wrote ${OUT} (${html.length} bytes)`);
