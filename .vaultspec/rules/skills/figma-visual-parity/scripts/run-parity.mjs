#!/usr/bin/env node
// Orchestrate the deterministic half of a parity run: capture the live route,
// build the comparison artifacts, and write the review page — in one command.
//
// The Figma capture itself is an MCP tool call (not scriptable here), so this
// orchestrator takes an already-downloaded Figma PNG. Typical flow:
//   1. MCP get_screenshot  -> image_url + width/height
//   2. node fetch-figma-asset.mjs --url <image_url> --out <out>/<slug>-figma-<node>.png
//   3. node run-parity.mjs --slug <slug> --url <live-url> \
//        --figma <out>/<slug>-figma-<node>.png --width <w> --height <h>
//
// Usage:
//   node run-parity.mjs --slug <slug> --url <live-url> --figma <figma.png> \
//     --width <px> --height <px> [--out output/visual-compare] [--wait-ms 6000] \
//     [--selector "<css>"] [--threshold 24] [--no-webgl] [--no-review] [--allow-resize]
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, requireArgs, asInt, asBool } from "./lib/args.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function run(script, scriptArgs) {
  return new Promise((res, rej) => {
    const child = spawn(process.execPath, [resolve(here, script), ...scriptArgs], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("error", rej);
    child.on("close", (code) =>
      code === 0 ? res() : rej(new Error(`${script} exited with code ${code}`)),
    );
  });
}

async function main() {
  const args = parseArgs();
  requireArgs(args, ["slug", "url", "figma", "width", "height"]);
  const slug = String(args.slug);
  const width = asInt(args.width);
  const height = asInt(args.height);
  if (!width || !height) throw new Error("--width and --height must be positive integers");
  const dims = `${width}x${height}`;
  const outDir = resolve(String(args.out ?? "output/visual-compare"));
  const figmaPath = resolve(String(args.figma));
  const livePath = resolve(outDir, `${slug}-live-${dims}.png`);

  console.log(`\n[1/3] Capturing live route at ${dims} ...`);
  const captureArgs = ["--url", String(args.url), "--width", String(width), "--height", String(height), "--out", livePath, "--wait-ms", String(asInt(args["wait-ms"], 6000))];
  if (typeof args.selector === "string") captureArgs.push("--selector", args.selector);
  if (!asBool(args.webgl, true)) captureArgs.push("--no-webgl");
  await run("capture-live-page.mjs", captureArgs);

  console.log("\n[2/3] Generating split / overlay / diff / report ...");
  const compareArgs = ["--figma", figmaPath, "--live", livePath, "--slug", slug, "--out", outDir, "--threshold", String(asInt(args.threshold, 24))];
  if (asBool(args["allow-resize"], false)) compareArgs.push("--allow-resize");
  await run("compare-pngs.mjs", compareArgs);

  if (asBool(args.review, true)) {
    console.log("\n[3/3] Writing static HTML review page ...");
    const figmaFile = figmaPath.split(/[\\/]/).pop();
    await run("write-review-page.mjs", ["--slug", slug, "--width", String(width), "--height", String(height), "--out", outDir, "--figma-file", figmaFile]);
  } else {
    console.log("\n[3/3] Skipping HTML review page (--no-review).");
  }

  console.log(`\nDone. Artifacts in ${outDir}. Inspect the overlay and diff before declaring parity.`);
}

main().catch((err) => {
  console.error(`run-parity: ${err.message}`);
  process.exit(1);
});
