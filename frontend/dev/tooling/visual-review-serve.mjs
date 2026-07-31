#!/usr/bin/env node
// Serve the visual review desk: the dev-domain Vite server, nothing else.
//
// The desk is UNTETHERED by design: every specimen renders a real production
// component from authored inputs, and the page's own fetch is hermetically inert
// (`dev/visual-review/hermetic.ts`). There is no engine to start, no demo corpus to
// point at, and no backend whose slowness or absence could blank a cell — which is
// the property the desk exists to guarantee. This wrapper survives only so the
// `just review` recipe keeps one stable entry point.

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEV_PORTS } from "../dev-ports.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(HERE, "..", "..");
const VITE = join(FRONTEND, "node_modules", "vite", "bin", "vite.js");

console.log(`[review] desk: http://localhost:${DEV_PORTS.visualReview}/visual-review/`);

const vite = spawn(process.execPath, [VITE, "--config", "vite.dev.config.ts"], {
  cwd: FRONTEND,
  stdio: "inherit",
});

vite.on("exit", (code) => {
  process.exit(code ?? 0);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    vite.kill();
  });
}
