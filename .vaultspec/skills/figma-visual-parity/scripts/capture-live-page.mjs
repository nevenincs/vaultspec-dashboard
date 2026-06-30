#!/usr/bin/env node
// Capture a live route at exact Figma dimensions using Playwright/Chromium.
// Cross-platform: a single Node script with no shell-specific syntax.
//
// Usage:
//   node capture-live-page.mjs --url <url> --width <px> --height <px> --out <file.png> \
//     [--wait-ms 6000] [--selector "<css>"] [--no-webgl] \
//     [--init-eval "<js>"] [--clip-selector "<css>"] [--vw 1440] [--vh 900]
//
// --init-eval runs a JS expression in the page after the wait and before the
//   screenshot (use it to drive a transient UI state, e.g. zoom a control). It is
//   awaited, then a short settle elapses.
// --clip-selector screenshots a single element instead of the page — for capturing
//   a sub-component. When set, the browser uses a real viewport (--vw/--vh, default
//   1440x900) and --width/--height describe only the target (Figma) dimensions for
//   downstream resize-compare (use --allow-resize in compare/run-parity).
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
  const initEval = typeof args["init-eval"] === "string" ? args["init-eval"] : null;
  const clipSelector = typeof args["clip-selector"] === "string" ? args["clip-selector"] : null;
  const vw = asInt(args.vw, clipSelector ? 1440 : width);
  const vh = asInt(args.vh, clipSelector ? 900 : height);
  const outPath = resolve(String(args.out));
  await mkdir(dirname(outPath), { recursive: true });

  const chromium = await loadChromium();
  const browser = await chromium.launch({
    headless: true,
    args: webgl ? WEBGL_FLAGS : [],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: vw, height: vh },
      deviceScaleFactor: 1,
    });
    await page.goto(String(args.url), { waitUntil: "domcontentloaded" });
    if (selector) {
      await page.waitForSelector(selector, { timeout: Math.max(waitMs, 1000) }).catch(() => {});
    }
    await page.waitForTimeout(waitMs);

    if (initEval) {
      // Run caller JS to drive a transient state, then let it settle/render.
      await page.evaluate(`(async () => { ${initEval} })()`).catch((e) => {
        console.error(`init-eval failed: ${e.message}`);
      });
      await page.waitForTimeout(600);
    }

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

    if (clipSelector) {
      await page.locator(clipSelector).first().screenshot({ path: outPath });
    } else {
      await page.screenshot({ path: outPath, fullPage: false });
    }
    console.log(
      JSON.stringify(
        { outPath, width, height, viewport: { width: vw, height: vh }, clipSelector, webgl, diagnostics },
        null,
        2,
      ),
    );

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
