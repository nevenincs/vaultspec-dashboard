#!/usr/bin/env node
// Capture a live route at exact Figma dimensions using Playwright/Chromium.
// Cross-platform: a single Node script with no shell-specific syntax.
//
// Usage:
//   node capture-live-page.mjs --url <url> --width <px> --height <px> --out <file.png> \
//     [--wait-ms 6000] [--selector "<css>"] [--no-webgl]
//
// Size matching is mandatory: the viewport is set to the Figma node's pixel
// dimensions with deviceScaleFactor 1 and fullPage false, so the capture overlays
// the design 1:1. See references/bounds-and-naming.md.
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs, requireArgs, asInt, asBool } from "./lib/args.mjs";
import { loadChromium } from "./lib/playwright.mjs";

// SwiftShader/WebGL flags make headless Chromium render WebGL/canvas (e.g. PixiJS)
// reliably across machines that lack a real GPU. Harmless for plain DOM pages.
const WEBGL_FLAGS = [
  "--ignore-gpu-blocklist",
  "--enable-webgl",
  "--use-gl=swiftshader",
  "--enable-unsafe-swiftshader",
];

async function main() {
  const args = parseArgs();
  requireArgs(args, ["url", "width", "height", "out"]);
  const width = asInt(args.width);
  const height = asInt(args.height);
  if (!width || !height) throw new Error("--width and --height must be positive integers");
  const waitMs = asInt(args["wait-ms"], 6000);
  const selector = typeof args.selector === "string" ? args.selector : null;
  const webgl = asBool(args.webgl, true);
  const outPath = resolve(String(args.out));
  await mkdir(dirname(outPath), { recursive: true });

  const chromium = await loadChromium();
  const browser = await chromium.launch({
    headless: true,
    args: webgl ? WEBGL_FLAGS : [],
  });
  try {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    await page.goto(String(args.url), { waitUntil: "domcontentloaded" });
    if (selector) {
      await page.waitForSelector(selector, { timeout: Math.max(waitMs, 1000) }).catch(() => {});
    }
    await page.waitForTimeout(waitMs);

    const diagnostics = await page.evaluate((sel) => {
      const text = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();
      const lower = text.toLowerCase();
      const rect = document.documentElement.getBoundingClientRect();
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        document: { width: Math.round(rect.width), height: Math.round(rect.height) },
        hasCanvas: Boolean(document.querySelector("canvas")),
        selectorFound: sel ? Boolean(document.querySelector(sel)) : null,
        // Generic WebGL/canvas-unavailable phrases emitted by browsers and common
        // renderers (e.g. PixiJS, three.js). Not app-specific.
        webglFallback:
          lower.includes("webgl") &&
          (lower.includes("not support") || lower.includes("not available") || lower.includes("required")),
        // Neutral evidence for the caller to judge readiness — no app-specific
        // text is matched. Use --selector for a deterministic readiness signal.
        bodyTextSample: text.slice(0, 200),
      };
    }, selector);

    await page.screenshot({ path: outPath, fullPage: false });
    console.log(JSON.stringify({ outPath, width, height, webgl, diagnostics }, null, 2));

    if (diagnostics.webglFallback) {
      console.error(
        "WARNING: page reported a WebGL fallback. The capture may not reflect the rendered design.",
      );
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`capture-live-page: ${err.message}`);
  process.exit(1);
});
