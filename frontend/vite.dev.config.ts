import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { DEV_ALLOWED_HOSTS, DEV_PORTS } from "./dev/dev-ports";

// The DEV-DOMAIN Vite config. `vite.config.ts` is strictly production; this one serves
// the visual review desk and the per-surface labs. It proxies NOTHING: the review desk
// is untethered by design (authored specimen inputs + a hermetically inert page fetch,
// see `dev/visual-review/hermetic.ts`), so there is no engine behind this server and
// nothing a slow or absent backend could blank.
//
// ROOT: this config roots at the frontend directory, NOT at `dev/`, and that is
// deliberate. Tailwind v4 detects which files to scan for utility classes starting from
// the Vite root; rooting at `dev/` meant it never scanned `src/**`, so the real
// application booted and rendered COMPLETELY UNSTYLED — every layout, spacing and
// border utility missing while the token colours still applied, which is a peculiarly
// misleading failure. Sharing production's root makes the review surface show the app
// exactly as the product build does.
//
// The fence does not depend on the root: `vite.config.ts` builds ONLY `index.html`, so
// nothing under `dev/` can reach a shipped bundle, and the one-way import law
// (`dev/**` may import `src/**`, never the reverse) is enforced by
// `dev/tooling/scan-domains.mjs`.
export default defineConfig({
  // A dep cache OF ITS OWN, and this is load-bearing rather than tidy.
  //
  // Vite's default cacheDir is `node_modules/.vite` for EVERY config in a project, so
  // this dev-domain server and the production one (`vite.config.ts`, `just serve`)
  // otherwise share a single optimized-dep store while scanning different entry graphs.
  // Starting one makes the other's dependencies stale, and Vite clears the directory to
  // re-optimize — so the still-running server keeps serving `?v=<hash>` URLs for files
  // that no longer exist. Those 504 "Outdated Optimize Dep", the dynamic import of each
  // surface fails, and the desk renders every cell as a BLANK RECTANGLE: the one failure
  // mode that makes the desk look like the application is broken when the application
  // was never reached. Distinct cacheDirs make the two servers unable to evict each
  // other, so either may run, in any order, at the same time.
  cacheDir: resolve(import.meta.dirname, "node_modules/.vite-dev"),
  plugins: [
    react(),
    tailwindcss(),
    {
      // Serve the review surface at `/visual-review/` while it physically lives under
      // `dev/`. Without this the URL would leak the directory layout, and the layout is
      // an implementation detail of the fence, not something a reviewer should have to
      // know to open the page.
      name: "dev-domain-routes",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url) {
            req.url = req.url.replace(/^\/visual-review(\/|$)/, "/dev/visual-review/");
            req.url = req.url.replace(/^\/labs(\/|$)/, "/dev/labs/");
          }

          // An unknown PATH must fail, not quietly hand back the application.
          //
          // Vite answers any unmatched navigation with `index.html`, which on this
          // dev-domain server is the real dashboard. So `/live-review` — a wrong
          // review URL — returned 200 and rendered the APPLICATION, with nothing on
          // screen to say you were not on the review desk. Someone reasonably
          // concluded the desk had turned into the app. A mistyped or stale review
          // URL is now a 404 that names the routes that do exist.
          //
          // Scoped to navigations (`Accept: text/html`): module, asset and API
          // requests must still flow to Vite untouched.
          const url = req.url ?? "";
          const isNavigation = (req.headers.accept ?? "").includes("text/html");
          const KNOWN = ["/dev/visual-review", "/dev/labs"];
          if (isNavigation && !KNOWN.some((k) => url.startsWith(k))) {
            if (url === "/" || url.startsWith("/?")) {
              res.statusCode = 302;
              res.setHeader("Location", "/visual-review/");
              res.end();
              return;
            }
            res.statusCode = 404;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end(
              `No dev surface at ${url}\n\n` +
                "This is the DEV-DOMAIN server; it does not serve the application.\n" +
                "Available:\n" +
                "  /visual-review/   the visual review desk\n" +
                "  /labs/            the per-surface labs\n",
            );
            return;
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      // Dev-domain modules reach production code through one explicit alias, so a
      // rehomed lab's imports stay readable and the direction of the dependency is
      // obvious at every call site.
      "@app": resolve(import.meta.dirname, "src"),
    },
  },
  server: {
    host: process.env.VAULTSPEC_DEV_HOST ?? true,
    allowedHosts: DEV_ALLOWED_HOSTS,
    // Exact, non-default port that FAILS FAST on a conflict rather than drifting to a
    // neighbour and colliding with another project's server (dev-workflow).
    port: DEV_PORTS.visualReview,
    strictPort: true,
  },
});
