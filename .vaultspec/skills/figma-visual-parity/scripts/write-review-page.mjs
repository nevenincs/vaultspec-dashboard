#!/usr/bin/env node
// Write a static, no-server HTML review page that loads the local comparison
// artifacts by relative path so it can be opened directly from a file browser.
// Cross-platform (pure Node string + file write).
//
// Usage:
//   node write-review-page.mjs --slug <slug> --width <px> --height <px> \
//     [--figma-file <slug>-figma-<node>.png] [--out output/visual-compare] \
//     [--figma-label "..."] [--live-label "..."]
//
// Expects the artifacts produced by compare-pngs.mjs to already exist in --out:
//   <slug>-split-<w>x<h>.png, <slug>-overlay-alpha-<w>x<h>.png, <slug>-diff-<w>x<h>.png
// --figma-file is the basename of the downloaded Figma PNG (it carries the node id);
// when omitted the overlay falls back to <slug>-figma.png.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs, requireArgs, asInt } from "./lib/args.mjs";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function main() {
  const args = parseArgs();
  requireArgs(args, ["slug", "width", "height"]);
  const slug = String(args.slug);
  const width = asInt(args.width);
  const height = asInt(args.height);
  const dims = `${width}x${height}`;
  const outDir = resolve(String(args.out ?? "output/visual-compare"));
  await mkdir(outDir, { recursive: true });

  const figmaLabel = esc(args["figma-label"] ?? "Figma reference");
  const liveLabel = esc(args["live-label"] ?? "Live implementation");
  const splitImg = `${slug}-split-${dims}.png`;
  const live = `${slug}-live-${dims}.png`;
  const figmaFile = typeof args["figma-file"] === "string" ? args["figma-file"] : `${slug}-figma.png`;
  const diffImg = `${slug}-diff-${dims}.png`;

  // The overlay blends the raw figma + live PNGs interactively (opacity slider),
  // so the reviewer can scrub between design and implementation in the browser.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(slug)} — visual parity</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0; padding: 24px; background: #fdfaf6; color: #312d28; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p.meta { color: #6b6258; margin: 0 0 20px; }
  section { margin: 0 0 32px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #8a8175; margin: 0 0 10px; }
  img { display: block; max-width: 100%; border: 1px solid #d8d0c7; background: #fff; image-rendering: pixelated; }
  .overlay-stage { position: relative; width: ${width}px; max-width: 100%; }
  .overlay-stage img { position: absolute; inset: 0; max-width: none; }
  .overlay-stage { height: ${height}px; }
  .controls { display: flex; align-items: center; gap: 12px; margin: 0 0 12px; }
  input[type="range"] { width: 280px; }
  output { font-variant-numeric: tabular-nums; }
  .caption { color: #6b6258; font-size: 12px; margin-top: 6px; }
</style>
</head>
<body>
  <h1>${esc(slug)} — visual parity</h1>
  <p class="meta">${figmaLabel} vs ${liveLabel} · ${esc(dims)} · open the JSON report for pixel-delta stats.</p>

  <section>
    <h2>Direct overlay</h2>
    <div class="controls">
      <label for="opacity">${liveLabel} opacity</label>
      <input id="opacity" type="range" min="0" max="1" step="0.01" value="0.5" />
      <output id="opacityValue">0.50</output>
    </div>
    <div class="overlay-stage">
      <img id="figma" src="${esc(figmaFile)}" alt="${figmaLabel}" />
      <img id="live" src="${esc(live)}" alt="${liveLabel}" style="opacity:.5" />
    </div>
    <p class="caption">Drag the slider to scrub between ${figmaLabel} (under) and ${liveLabel} (over).</p>
  </section>

  <section>
    <h2>Split view</h2>
    <img src="${esc(splitImg)}" alt="split view: ${figmaLabel} | ${liveLabel}" />
  </section>

  <section>
    <h2>Pixel difference</h2>
    <img src="${esc(diffImg)}" alt="pixel difference" />
    <p class="caption"><span style="color:#00a651">Green</span> = content in the design
       the live build is missing; <span style="color:#e0218a">magenta</span> = content
       the live build added that the design lacks; faint gray = unchanged.</p>
  </section>

  <script>
    const opacity = document.querySelector("#opacity");
    const opacityValue = document.querySelector("#opacityValue");
    const live = document.querySelector("#live");
    opacity.addEventListener("input", () => {
      live.style.opacity = opacity.value;
      opacityValue.value = Number(opacity.value).toFixed(2);
    });
  </script>
</body>
</html>
`;

  const htmlPath = resolve(outDir, `${slug}-visual-compare.html`);
  await writeFile(htmlPath, html);
  console.log(JSON.stringify({ htmlPath }, null, 2));
}

main().catch((err) => {
  console.error(`write-review-page: ${err.message}`);
  process.exit(1);
});
