#!/usr/bin/env node
// Generate split / direct-overlay / pixel-diff PNGs and a JSON report from a
// Figma reference PNG and a live capture PNG.
//
// Compositing runs in browser-native Canvas through Playwright, so there are NO
// native image dependencies (no `canvas`, `sharp`, `pngjs`, or `jimp`). This keeps
// the skill portable across Windows, macOS, and Linux.
//
// Usage:
//   node compare-pngs.mjs --figma <figma.png> --live <live.png> --slug <slug> \
//     [--out output/visual-compare] [--threshold 24] [--allow-resize]
//
// By default a dimension mismatch is a hard failure (a fixed-size Figma node must
// be compared against an equally sized capture). --allow-resize scales the live
// image onto the Figma dimensions and records that it did so.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { parseArgs, requireArgs, asInt, asBool } from "./lib/args.mjs";
import { loadChromium } from "./lib/playwright.mjs";

async function toDataUrl(path) {
  const buf = await readFile(path);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

async function main() {
  const args = parseArgs();
  requireArgs(args, ["figma", "live", "slug"]);
  const slug = String(args.slug);
  const threshold = asInt(args.threshold, 24);
  const allowResize = asBool(args["allow-resize"], false);
  const outDir = resolve(String(args.out ?? "output/visual-compare"));
  await mkdir(outDir, { recursive: true });

  const figmaPath = resolve(String(args.figma));
  const livePath = resolve(String(args.live));
  const figmaUrl = await toDataUrl(figmaPath);
  const liveUrl = await toDataUrl(livePath);

  const chromium = await loadChromium();
  const browser = await chromium.launch({ headless: true });
  let result;
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    result = await page.evaluate(
      async ({ figmaUrl, liveUrl, threshold, allowResize }) => {
        function load(src) {
          return new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = () => rej(new Error("failed to decode an input PNG"));
            img.src = src;
          });
        }
        const b64 = (canvas) => canvas.toDataURL("image/png").split(",")[1];

        const figma = await load(figmaUrl);
        const live = await load(liveUrl);
        const fw = figma.naturalWidth;
        const fh = figma.naturalHeight;
        const lw = live.naturalWidth;
        const lh = live.naturalHeight;
        const mismatch = fw !== lw || fh !== lh;
        if (mismatch && !allowResize) {
          return { dimensionMismatch: { figma: { width: fw, height: fh }, live: { width: lw, height: lh } } };
        }
        // Compare on the Figma canvas size; scale live in only when resize is allowed.
        const width = fw;
        const height = fh;
        const drawLive = (ctx) =>
          mismatch ? ctx.drawImage(live, 0, 0, width, height) : ctx.drawImage(live, 0, 0);

        const BG = "#fdfaf6";
        const INK = "#312d28";
        const RULE = "#d8d0c7";

        // Split: Figma | Live, side by side with a labelled header band.
        const split = document.createElement("canvas");
        split.width = width * 2 + 1;
        split.height = height + 26;
        let ctx = split.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, split.width, split.height);
        ctx.fillStyle = INK;
        ctx.font = "12px sans-serif";
        ctx.fillText("Figma", 8, 17);
        ctx.fillText("Live", width + 17, 17);
        ctx.fillStyle = BG;
        ctx.fillRect(0, 26, width, height);
        ctx.drawImage(figma, 0, 26);
        ctx.fillStyle = RULE;
        ctx.fillRect(width, 26, 1, height);
        ctx.fillStyle = BG;
        ctx.fillRect(width + 1, 26, width, height);
        ctx.save();
        ctx.translate(width + 1, 26);
        drawLive(ctx);
        ctx.restore();

        // Direct alpha overlay.
        const overlay = document.createElement("canvas");
        overlay.width = width;
        overlay.height = height;
        ctx = overlay.getContext("2d");
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 0.55;
        ctx.drawImage(figma, 0, 0);
        ctx.globalAlpha = 0.55;
        drawLive(ctx);
        ctx.globalAlpha = 1;

        // Read pixels for both images on a scratch canvas.
        const scratch = document.createElement("canvas");
        scratch.width = width;
        scratch.height = height;
        ctx = scratch.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(figma, 0, 0);
        const figmaData = ctx.getImageData(0, 0, width, height);
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, width, height);
        drawLive(ctx);
        const liveData = ctx.getImageData(0, 0, width, height);

        // Directional difference image, tuned for both human and vision-model
        // legibility. Vision-language models downsample into coarse patches and
        // have uneven hue perception, so a subtle red-on-warm gradient reads
        // poorly. Instead:
        //   - unchanged (delta <= threshold): faint grayscale ghost for context
        //   - design has content the live build LACKS  -> GREEN   ("missing")
        //   - live build added content the design LACKS -> MAGENTA ("extra")
        // Magenta+green are complementary, high-luminance-contrast, colorblind-safe,
        // and saturated enough to survive downsampling — direction is narratable.
        const diff = document.createElement("canvas");
        diff.width = width;
        diff.height = height;
        ctx = diff.getContext("2d");
        const diffData = ctx.createImageData(width, height);
        const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
        let changed = 0;
        let missing = 0;
        let extra = 0;
        let total = 0;
        let sum = 0;
        for (let i = 0; i < diffData.data.length; i += 4) {
          const fr = figmaData.data[i], fg = figmaData.data[i + 1], fb = figmaData.data[i + 2];
          const lr = liveData.data[i], lg = liveData.data[i + 1], lb = liveData.data[i + 2];
          const delta = Math.max(Math.abs(fr - lr), Math.abs(fg - lg), Math.abs(fb - lb));
          sum += delta;
          total += 1;
          if (delta > threshold) {
            changed += 1;
            // Lower luminance = more ink. If the design pixel is darker/richer,
            // the design has content the live render dropped (missing); otherwise
            // the live render painted content the design does not have (extra).
            if (lum(fr, fg, fb) <= lum(lr, lg, lb)) {
              missing += 1;
              diffData.data[i] = 0; diffData.data[i + 1] = 166; diffData.data[i + 2] = 81; // green
            } else {
              extra += 1;
              diffData.data[i] = 224; diffData.data[i + 1] = 33; diffData.data[i + 2] = 138; // magenta
            }
          } else {
            const g = Math.round(lum(fr, fg, fb) * 0.2 + 255 * 0.8); // ~80% toward white
            diffData.data[i] = g; diffData.data[i + 1] = g; diffData.data[i + 2] = g;
          }
          diffData.data[i + 3] = 255;
        }
        ctx.putImageData(diffData, 0, 0);

        return {
          dimensions: {
            figma: { width: fw, height: fh },
            live: { width: lw, height: lh },
            compare: { width, height },
            resized: mismatch,
          },
          pixelDelta: {
            threshold,
            changedPixelsOverThreshold: changed,
            missingInLive: missing,
            extraInLive: extra,
            totalPixels: total,
            changedRatio: Number((changed / total).toFixed(4)),
            meanMaxChannelDelta: Number((sum / total).toFixed(2)),
          },
          images: { split: b64(split), overlay: b64(overlay), diff: b64(diff) },
        };
      },
      { figmaUrl, liveUrl, threshold, allowResize },
    );
  } finally {
    await browser.close();
  }

  if (result.dimensionMismatch) {
    const { figma, live } = result.dimensionMismatch;
    throw new Error(
      `Dimension mismatch: Figma ${figma.width}x${figma.height} vs live ${live.width}x${live.height}. ` +
        "Re-capture the live route at the Figma dimensions, or pass --allow-resize to scale (documented in the report).",
    );
  }

  const { width, height } = result.dimensions.compare;
  const dims = `${width}x${height}`;
  const artifacts = {
    split: resolve(outDir, `${slug}-split-${dims}.png`),
    overlay: resolve(outDir, `${slug}-overlay-alpha-${dims}.png`),
    diff: resolve(outDir, `${slug}-diff-${dims}.png`),
  };
  for (const [name, b64] of Object.entries(result.images)) {
    await writeFile(artifacts[name], Buffer.from(b64, "base64"));
  }

  const report = {
    figma: { path: figmaPath, file: basename(figmaPath), ...result.dimensions.figma },
    live: { path: livePath, file: basename(livePath), ...result.dimensions.live },
    compare: result.dimensions.compare,
    artifacts: {
      split: { path: artifacts.split, file: basename(artifacts.split) },
      overlay: { path: artifacts.overlay, file: basename(artifacts.overlay) },
      diff: { path: artifacts.diff, file: basename(artifacts.diff) },
    },
    pixelDelta: result.pixelDelta,
  };
  const reportPath = resolve(outDir, `${slug}-visual-compare-report.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

main().catch((err) => {
  console.error(`compare-pngs: ${err.message}`);
  process.exit(1);
});
