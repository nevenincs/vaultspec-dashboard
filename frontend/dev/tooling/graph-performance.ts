import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";
import type { Plugin } from "vite";
import { DEV_PORTS } from "../dev-ports.ts";
import { runPairedKernels, waitForFonts } from "../performance/pairedKernels.ts";

type Benchmark = typeof import("../performance/graphHarness");
declare global {
  interface Window {
    graphBenchmark: Benchmark;
  }
}

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repository = resolve(frontend, "..");
const output = resolve(repository, ".tmp/graph-performance");
const option = (name: string, fallback = "") => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : (process.argv[index + 1] ?? "");
};
const reference = option("--baseline");
if (!reference || reference.startsWith("-"))
  throw new Error("Supply --baseline <git-ref>");
const git = (...args: string[]) =>
  execFileSync("git", args, {
    cwd: repository,
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 32 * 1024 * 1024,
  });
const baseline = git("rev-parse", "--verify", `${reference}^{commit}`).trim();
const counts = option("--counts", "1200,5000").split(",").map(Number);
if (
  counts.length > 5 ||
  counts.some((n) => !Number.isInteger(n) || n < 10 || n > 20000)
) {
  throw new Error("Use at most five node counts between 10 and 20000");
}
const phase = option("--phase", "all");
if (!["all", "kernels", "host"].includes(phase)) throw new Error("Unknown --phase");
const buildOnly = process.argv.includes("--build-only");
const browserArgs = process.platform === "win32" ? ["--use-angle=d3d11"] : [];
const digest = (content: string | Buffer) =>
  createHash("sha256").update(content).digest("hex");
async function readDependencies() {
  const files = [
    "package.json",
    "package-lock.json",
    ...[
      "vite",
      "@tailwindcss/vite",
      "tailwindcss",
      "@vitejs/plugin-react",
      "@playwright/test",
      "playwright",
      "three",
      "d3-force",
      "culori",
      "react",
      "react-dom",
    ].map((name) => `node_modules/${name}/package.json`),
  ];
  return Object.fromEntries(
    await Promise.all(
      files.map(async (path) => {
        const content = await readFile(resolve(frontend, path), "utf8");
        return [
          path,
          { sha256: digest(content), version: JSON.parse(content).version },
        ];
      }),
    ),
  );
}
const dependencies = await readDependencies();
async function verifyDependencies() {
  if (JSON.stringify(await readDependencies()) !== JSON.stringify(dependencies))
    throw new Error("Dependencies changed during this run; discard its measurements");
}

function historicSources(): Plugin {
  return {
    name: "historical-production-sources",
    enforce: "pre",
    load(id) {
      const path = relative(frontend, id.split("?")[0]).split(sep).join("/");
      if (!path.startsWith("src/")) return null;
      // Only source reads change. Both revisions use the same installed dependencies
      // and the same benchmark; no legacy physics copy is maintained in the harness.
      return git("show", `${baseline}:frontend/${path}`);
    },
  };
}

if (buildOnly) {
  const [{ build }, { default: react }, { default: tailwindcss }] = await Promise.all([
    import("vite"),
    import("@vitejs/plugin-react"),
    import("@tailwindcss/vite"),
  ]);
  for (const label of ["baseline", "candidate"]) {
    await build({
      configFile: false,
      root: frontend,
      logLevel: "warn",
      plugins: [
        ...(label === "baseline" ? [historicSources()] : []),
        react(),
        tailwindcss(),
      ],
      resolve: { alias: { "@app": resolve(frontend, "src") } },
      build: {
        outDir: resolve(output, label),
        emptyOutDir: false,
        reportCompressedSize: false,
        lib: {
          entry: resolve(frontend, "dev/performance/graphHarness.ts"),
          formats: ["es"],
          fileName: () => "graph.js",
          cssFileName: "graph",
        },
        minify: true,
        sourcemap: true,
      },
    });
    console.log(`Built ${label} production benchmark`);
  }
}

await verifyDependencies();
if (!buildOnly) {
  // Six immutable assets per run: later standalone builds cannot change pages
  // already being compared. Disk fingerprints are checked again before saving.
  const assets = new Map<string, Buffer>();
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <link rel="stylesheet" href="graph.css"><style>
    body{margin:0}#field{position:absolute;inset:0}#input{position:absolute;top:0;left:0;z-index:2}
    </style></head><body><div id="field"></div><button id="input">Input probe</button>
    <script type="module">import * as benchmark from './graph.js';window.graphBenchmark=benchmark;</script></body></html>`;
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      const parts = pathname.split("/").filter(Boolean);
      if (!["baseline", "candidate"].includes(parts[0] ?? "")) {
        response.writeHead(404).end();
        return;
      }
      if (parts.length === 1) {
        response.setHeader("content-type", "text/html");
        response.end(html);
        return;
      }
      const path = resolve(output, ...parts);
      if (!path.startsWith(output + sep)) {
        response.writeHead(404).end();
        return;
      }
      response.setHeader(
        "content-type",
        path.endsWith(".js")
          ? "text/javascript"
          : path.endsWith(".css")
            ? "text/css"
            : "application/octet-stream",
      );
      const content = assets.get(path);
      if (!content) {
        response.writeHead(404).end();
        return;
      }
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(DEV_PORTS.perf, "127.0.0.1", done);
  });
  const rows: object[] = [];
  const browser = await (async () => {
    // Reserve the port before rebuilding fixed artifact paths. Dispose the
    // compiler process before browser work, including its native workers/env.
    execFileSync(
      process.execPath,
      [fileURLToPath(import.meta.url), ...process.argv.slice(2), "--build-only"],
      { cwd: frontend, stdio: "inherit", timeout: 180000 },
    );
    await verifyDependencies();
    for (const label of ["baseline", "candidate"]) {
      for (const file of ["graph.js", "graph.css", "graph.js.map"]) {
        const path = resolve(output, label, file);
        assets.set(path, await readFile(path));
      }
    }
    return chromium.launch({ channel: "chrome", headless: true, args: browserArgs });
  })().catch(async (error: unknown) => {
    await new Promise<void>((done) => server.close(() => done()));
    throw error;
  });
  try {
    await warmRenderer(browser);
    for (let index = 0; index < counts.length; index++) {
      const count = counts[index];
      if (phase !== "host") {
        const paired = await runPairedKernels(
          browser,
          `http://127.0.0.1:${DEV_PORTS.perf}`,
          count,
        );
        rows.push(...paired);
        for (const row of paired) console.log(JSON.stringify(row));
      }
      if (phase === "kernels") continue;
      for (const label of index % 2
        ? ["candidate", "baseline"]
        : ["baseline", "candidate"]) {
        const page = await browser.newPage({
          viewport: { width: 1440, height: 900 },
          deviceScaleFactor: 1,
        });
        page.setDefaultTimeout(180000);
        const errors: string[] = [];
        page.on("pageerror", (error) => {
          if (errors.length < 20) errors.push(error.stack ?? error.message);
        });
        try {
          await page.goto(`http://127.0.0.1:${DEV_PORTS.perf}/${label}/`);
          await page.waitForFunction(() => Boolean(window.graphBenchmark), undefined, {
            timeout: 10000,
          });
          await waitForFonts(page);
          await page.waitForFunction(
            () => {
              const context = window.graphBenchmark.environment();
              return !context.contextLost && Boolean(context.renderer);
            },
            undefined,
            { timeout: 10000 },
          );
          const environment = await page.evaluate(() =>
            window.graphBenchmark.environment(),
          );
          console.log(JSON.stringify({ label, count, environment }));
          {
            const rebuild = await page.evaluate(
              (count) => window.graphBenchmark.rebuild(count),
              count,
            );
            const cold = await page.evaluate(
              (count) => window.graphBenchmark.prepare(count),
              count,
            );
            const live = await measureLive(page);
            console.log(JSON.stringify({ label, count, rebuild, cold, live }));
            let settle = await page.evaluate(() => window.graphBenchmark.settleChunk());
            const deadline = Date.now() + 180000;
            while (!settle.settled) {
              if (Date.now() > deadline)
                throw new Error("Natural settle exceeded 180 seconds");
              settle = await page.evaluate(() => window.graphBenchmark.settleChunk());
              if (settle.ticks % 120 === 0)
                console.log(`${label} ${count}: ${settle.ticks} settle ticks`);
            }
            const drag = await page.evaluate(() => window.graphBenchmark.drag());
            const dragLive = await measureLive(page);
            const idle = await page.evaluate(() => window.graphBenchmark.idle());
            rows.push({
              label,
              kind: "host",
              count,
              environment,
              rebuild,
              cold,
              live,
              settle,
              drag,
              dragLive,
              idle,
              errors,
            });
            console.log(JSON.stringify(rows[rows.length - 1]));
          }
          if (
            await page.evaluate(() => window.graphBenchmark.environment().contextLost)
          )
            throw new Error("Rendering context lost during measurement");
          if (errors.length) throw new Error(errors.join("\n"));
        } finally {
          await page.evaluate(() => window.graphBenchmark?.destroy()).catch(() => {});
          await page.close();
        }
      }
    }
    const hashes = Object.fromEntries(
      [...assets].map(([path, content]) => [
        relative(output, path).split(sep).join("/"),
        digest(content),
      ]),
    );
    for (const [path, content] of assets) {
      if (digest(await readFile(path)) !== digest(content)) {
        throw new Error(
          "Benchmark artifacts changed during this run; discard its measurements",
        );
      }
    }
    await verifyDependencies();
    const result = {
      timestamp: new Date().toISOString(),
      baseline,
      head: git("rev-parse", "HEAD").trim(),
      dirtySources: git("status", "--short", "--", "frontend/src").trim(),
      node: process.version,
      cpu: cpus()[0]?.model,
      phase,
      hashes,
      dependencies,
      browserArgs,
      rows,
    };
    const report = resolve(output, `${phase}-results.json`);
    await writeFile(report, JSON.stringify(result, null, 2) + "\n");
    console.log(`Saved ${report}`);
  } finally {
    try {
      await browser.close();
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  }
}

async function measureLive(page: Page) {
  const run = page.evaluate(() => window.graphBenchmark.live());
  // Real browser inputs, independent of the busy page's timer queue. The Event
  // Timing samples are diagnostic observations, not a page-wide INP certificate.
  const clicks = async () => {
    for (let i = 0; i < 8; i++) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      await page.mouse.click(25, 10);
    }
  };
  const [result] = await Promise.all([run, clicks()]);
  return result;
}

async function warmRenderer(browser: Browser) {
  // A fresh browser can fail its first GPU context while the GPU process starts.
  // Warm that process before either revision, outside every measured interval.
  for (let attempt = 0; attempt < 5; attempt++) {
    const page = await browser.newPage();
    try {
      const ready = await page.evaluate(async () => {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("webgl2", {
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: true,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
        const extension = context?.getExtension("WEBGL_debug_renderer_info");
        return {
          context: Boolean(context),
          lost: context?.isContextLost(),
          renderer:
            context && extension
              ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL)
              : null,
        };
      });
      console.log(JSON.stringify({ gpuProbe: attempt + 1, ...ready }));
      if (ready.context && !ready.lost && ready.renderer) return;
    } finally {
      await page.close();
    }
  }
  throw new Error("Browser did not establish a stable WebGL context after five probes");
}
