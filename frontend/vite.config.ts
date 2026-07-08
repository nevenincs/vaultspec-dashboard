import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { DEV_ALLOWED_HOSTS, DEV_PORTS } from "./dev-ports";
import { engineDevPlugin } from "./vite-plugins/engine-dev";

// The dev orchestrator (engineDevPlugin) may serve the engine on a non-default
// port; the proxy target tracks the same canonical value so the two never
// disagree. All dev/test ports live in ./dev-ports.ts (exact, non-default,
// fail-fast).
const enginePort = DEV_PORTS.engine;

// Dev-mode token bootstrap (DF-6 amendment): the browser cannot read
// service.json, so the dev proxy injects the Authorization header from
// the engine's service file on every proxied request. Read fresh per
// request — the token rotates when the service restarts.
function serviceToken(): string | null {
  try {
    const raw = readFileSync(
      resolve(import.meta.dirname, "../.vault/data/engine-data/service.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as { service_token?: string };
    return parsed.service_token ?? null;
  } catch {
    return null;
  }
}

// SPA build served by `vaultspec serve` in production (gui-spec §5.1).
// The spike page (spike.html) is a separate dev-only entry, excluded from the
// production build.
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), engineDevPlugin()],
  build: {
    rollupOptions: {
      input:
        command === "build"
          ? {
              index: resolve(import.meta.dirname, "index.html"),
            }
          : undefined,
      output: {
        // Split stable vendor libraries into their own cacheable chunks
        // (perf-sweep F#2): an app-code change no longer re-downloads
        // React/TanStack, and the eager entry chunk is smaller to parse and
        // compile at startup. Pure chunk grouping — no behaviour change.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/@tanstack/")) return "vendor-tanstack";
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          )
            return "vendor-react";
          if (id.includes("/graphology") || id.includes("/d3-")) return "vendor-graph";
          return "vendor";
        },
      },
    },
  },
  server: {
    // Bind to all interfaces (0.0.0.0 + ::) so the dev dashboard is reachable
    // from other machines on the same Tailscale network, not just localhost.
    // `host: true` is the Vite equivalent of `--host`. Override with a specific
    // address via VAULTSPEC_DEV_HOST if a narrower bind is wanted.
    host: process.env.VAULTSPEC_DEV_HOST ?? true,
    // Accept the Host header from machines reaching the dev server over the
    // Tailscale network by hostname (DNS-rebinding guard). localhost is always
    // allowed by Vite; the network hostnames live in ./dev-ports.ts and are
    // env-extendable via VAULTSPEC_DEV_ALLOWED_HOSTS.
    allowedHosts: DEV_ALLOWED_HOSTS,
    // Pin the SPA dev server to an exact, non-default port and FAIL FAST if it
    // is taken (strictPort) rather than silently drifting to the next free port
    // and colliding with another project's server. See ./dev-ports.ts.
    port: DEV_PORTS.spa,
    strictPort: true,
    // Engine API proxy during development; in production the SPA and API
    // share the engine's single origin (contract §1).
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${enginePort}`,
        // Rewrite the forwarded Host to the loopback engine target. The engine's
        // bearer_gate validates Host as a DNS-rebinding guard and only accepts
        // 127.0.0.1/localhost/[::1]; a remote (Tailscale) client sends a foreign
        // Host, so without changeOrigin the proxied request is rejected with 403.
        // The engine itself stays loopback-bound — only Vite faces the network.
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            const token = serviceToken();
            if (token && !proxyReq.getHeader("authorization")) {
              proxyReq.setHeader("Authorization", `Bearer ${token}`);
            }
          });
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "spike/**/*.test.ts", "scripts/**/*.test.ts"],
    // happy-dom enforces the Same-Origin Policy on fetch; the DOM-bearing tests
    // call the live engine on a loopback port (a different origin), so SOP is
    // disabled for the test environment. Only affects happy-dom-env files.
    environmentOptions: {
      happyDOM: { settings: { fetch: { disableSameOriginPolicy: true } } },
    },
    // Test-integrity: the suite runs ONLINE against the real `vaultspec serve`
    // binary — never an in-memory double. This setup spawns the engine over a
    // deterministic fixture vault once and publishes ENGINE_BASE_URL/ENGINE_TOKEN.
    globalSetup: ["./src/testing/liveEngine.globalSetup.ts"],
    // Bind the app-wide engine client to the live transport in every worker.
    setupFiles: ["./src/testing/liveSetup.ts"],
    // All test files share ONE spawned engine with mutable state (settings,
    // session, the editor write seam). Running files sequentially makes write
    // round-trips deterministic — a parallel file can't overwrite the global a
    // sibling just wrote and is about to read back.
    fileParallelism: false,
    // The engine cold-indexes the fixture on boot; give startup-bound suites room.
    testTimeout: 15_000,
    hookTimeout: 35_000,
    // Per-file timing instrumentation (TIH P05): OPT-IN and zero-impact by
    // default. With `VAULTSPEC_TEST_TIMING=1` the run adds the slowest-first
    // per-file wall-clock reporter alongside the default reporter (and writes a
    // machine-readable profile when `VAULTSPEC_TEST_TIMING_OUT` is also set);
    // unset, vitest uses its default reporter and the timing reporter is never
    // loaded, so a normal run and the gate are unaffected.
    ...(process.env.VAULTSPEC_TEST_TIMING === "1"
      ? { reporters: ["default", "./src/testing/perFileTimingReporter.ts"] }
      : {}),
  },
}));
