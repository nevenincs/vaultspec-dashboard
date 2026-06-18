#!/usr/bin/env node
// Download a Figma asset URL to a local PNG. Cross-platform replacement for the
// `curl.exe` + PowerShell `New-Item` pattern — uses Node's built-in fetch
// (Node >= 18) so it behaves identically on Windows, macOS, and Linux.
//
// Usage:
//   node fetch-figma-asset.mjs --url <asset-url> --out <path/to/file.png>
//
// The asset URL returned by the Figma screenshot MCP tool is short-lived and
// must be treated as a secret: pass it on the command line, never write it to a
// repo file. This script only persists the downloaded bytes.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs, requireArgs } from "./lib/args.mjs";

async function main() {
  const args = parseArgs();
  requireArgs(args, ["url", "out"]);
  const outPath = resolve(String(args.out));

  const res = await fetch(String(args.url), { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error("Download produced 0 bytes; the asset URL may have expired.");
  }
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, bytes);

  const contentType = res.headers.get("content-type") ?? "unknown";
  console.log(JSON.stringify({ outPath, bytes: bytes.length, contentType }, null, 2));
}

main().catch((err) => {
  console.error(`fetch-figma-asset: ${err.message}`);
  process.exit(1);
});
