import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { DEV_ALLOWED_HOSTS, DEV_PORTS } from "./dev/dev-ports";

// ---- review feedback persistence -------------------------------------------------
//
// The desk's feedback pane stores per-component review notes in a FILE, not the
// browser: a reviewer annotates from any machine on the network, and the notes land
// where a coding session can read and act on them. The dev server that already
// serves the page is the only carrier — this adds no availability dependency the
// desk does not have, and the page itself stays hermetic toward the engine.
//
// The store is a self-ignored directory (its own `.gitignore`), because review
// notes are transient working data, never a tracked artifact.

const FEEDBACK_DIR = resolve(import.meta.dirname, "dev/visual-review/.feedback");
const FEEDBACK_FILE = resolve(FEEDBACK_DIR, "notes.json");
// Bounds: a review pass produces tens of notes; these caps only stop runaway input.
const FEEDBACK_MAX_NOTES = 500;
const FEEDBACK_MAX_TEXT = 4000;

interface FeedbackNote {
  id: string;
  surface: string;
  state: string | null;
  text: string;
  created: string;
  resolved: boolean;
}

function readNotes(): FeedbackNote[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(FEEDBACK_FILE, "utf8"));
    return Array.isArray(parsed) ? (parsed as FeedbackNote[]) : [];
  } catch {
    return [];
  }
}

function writeNotes(notes: FeedbackNote[]): void {
  mkdirSync(FEEDBACK_DIR, { recursive: true });
  // Keep the directory self-ignored so transient review data never enters git.
  writeFileSync(resolve(FEEDBACK_DIR, ".gitignore"), "*\n");
  const tmp = `${FEEDBACK_FILE}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(notes, null, 2)}\n`);
  renameSync(tmp, FEEDBACK_FILE);
}

function applyFeedbackOp(op: Record<string, unknown>): FeedbackNote[] {
  const notes = readNotes();
  switch (op.action) {
    case "add": {
      const text = String(op.text ?? "")
        .slice(0, FEEDBACK_MAX_TEXT)
        .trim();
      if (!text) return notes;
      notes.push({
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        surface: String(op.surface ?? ""),
        state: typeof op.state === "string" ? op.state : null,
        text,
        created: new Date().toISOString(),
        resolved: false,
      });
      return notes.slice(-FEEDBACK_MAX_NOTES);
    }
    case "resolve": {
      const note = notes.find((n) => n.id === op.id);
      if (note) note.resolved = Boolean(op.resolved);
      return notes;
    }
    case "remove":
      return notes.filter((n) => n.id !== op.id);
    case "clear-resolved":
      return notes.filter((n) => !n.resolved);
    case "clear-all":
      return [];
    default:
      return notes;
  }
}

function handleFeedback(req: IncomingMessage, res: ServerResponse): void {
  if (req.method === "GET") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(readNotes()));
    return;
  }
  if (req.method === "POST") {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      // Bounded body: an op is a short note, never a payload.
      if (body.length < FEEDBACK_MAX_TEXT * 2) body += chunk.toString("utf8");
    });
    req.on("end", () => {
      let updated: FeedbackNote[];
      try {
        updated = applyFeedbackOp(JSON.parse(body) as Record<string, unknown>);
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "malformed feedback op" }));
        return;
      }
      writeNotes(updated);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(updated));
    });
    return;
  }
  res.statusCode = 405;
  res.end();
}

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
          if ((req.url ?? "").startsWith("/visual-review-feedback")) {
            handleFeedback(req, res);
            return;
          }
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
