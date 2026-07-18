// Editor live-UI e2e configuration (live-ui-testing): a fully self-contained
// project — the spec spawns its OWN scratch-worktree `vaultspec serve` (which
// also serves the built SPA bundle via VAULTSPEC_SPA_DIR), so no dev server or
// resident engine is required and the shared main worktree is never touched.
// One command: `npm run e2e:editor` (prerequisites: `npm run build` for the SPA
// bundle, a built engine binary under engine/target — both fail loud if absent).

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /editor\.spec\.ts/,
  // One serial browser session over one spawned engine: the scenarios build on
  // each other (open → edit → agent applies land under the open editor).
  workers: 1,
  timeout: 60_000,
  use: {
    // System Chrome, headless; SwiftShader keeps the app's WebGL scene alive in
    // headless (the graph canvas mounts with the shell even though the editor is
    // under test) — the proven recipe from prior live verification.
    channel: "chrome",
    headless: true,
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
      ],
    },
  },
  outputDir: "./test-results/editor",
  reporter: [["list"]],
});
