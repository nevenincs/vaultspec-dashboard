import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
// The spike page (spike.html) is a separate dev-only entry for the renderer
// frame-time gate (gui-spec §6.1); it is excluded from the production build.
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input:
        command === "build"
          ? { index: resolve(import.meta.dirname, "index.html") }
          : undefined,
    },
  },
  server: {
    // Engine API proxy during development; in production the SPA and API
    // share the engine's single origin (contract §1).
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8767",
        changeOrigin: false,
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
    include: ["src/**/*.test.{ts,tsx}", "spike/**/*.test.ts"],
  },
}));
