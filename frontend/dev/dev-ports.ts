import { readFileSync } from "node:fs";
import { hostname } from "node:os";

// Every vaultspec-dashboard dev/test server port, read from the ONE place that
// declares them: the `portless` and `devserver` keys of frontend/package.json.
//
// That declaration is the machine-wide dev-server standard shared by every web
// app on this workstation (`dev/devserver.py`, driven by `just dev`). It gives
// this app the block 5320-5339, clear of the framework defaults (Vite 5173,
// 3000, 8080) and of the 87xx neighbourhood where vaultspec-rag (8766), Qdrant
// (8764/8765) and the installed engine's product default (8767) live. The
// harness starts, reattaches, health-checks and evicts; this module only tells
// the Vite configs, the engine plugin, Playwright and the tooling which number
// to use, so nothing here restates a port.
//
// Two rules keep us deterministic:
//
//   1. EXACT, NON-DEFAULT ports, every one declared inside the block.
//   2. FAIL FAST. Vite servers bind with `strictPort`, so a taken port aborts
//      the boot with a clear error instead of drifting to a neighbour. The Rust
//      engine already fails loud on a bind conflict.
//
// Each port stays env-overridable (`VAULTSPEC_DEV_*_PORT`) for the rare case a
// run must sit elsewhere. The ONE deliberate exception to pinning is the vitest
// live engine, which binds an OS-assigned ephemeral port (see
// liveEngine.globalSetup.ts): a free-port pick is the strongest anti-collision
// guarantee for an automated, possibly-parallel test process.

interface Declaration {
  portless?: { appPort?: unknown };
  devserver?: { services?: Record<string, { port?: unknown } | undefined> };
}

const DECLARATION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as Declaration;

/** The port frontend/package.json declares for `service` (`dev` is the SPA). */
function declared(service: string): number {
  const value =
    service === "dev"
      ? DECLARATION.portless?.appPort
      : DECLARATION.devserver?.services?.[service]?.port;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(
      `frontend/package.json declares no port for dev-server service "${service}"`,
    );
  }
  return value;
}

function port(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(
      `${envVar} must be a TCP port in 1-65535, got: ${JSON.stringify(raw)}`,
    );
  }
  return parsed;
}

export const DEV_PORTS = {
  /** Main SPA dev server (`portless.appPort`) - `just dev`. */
  spa: port("VAULTSPEC_DEV_SPA_PORT", declared("dev")),
  /**
   * Rust engine (`vaultspec serve`) the SPA dev server proxies `/api` to. The
   * engine-dev Vite plugin spawns it; the harness frees this port of any foreign
   * holder (another worktree's engine) before the SPA starts, so the plugin never
   * adopts an engine serving some other checkout. Not the installed product's
   * default port - that stays the engine's own `DEFAULT_PORT`.
   */
  engine: port("VAULTSPEC_DEV_PORT", declared("engine")),
  /** Adverse-condition and localization Playwright SPA (mock engine, dev affordances). */
  adverse: port("VAULTSPEC_DEV_ADVERSE_PORT", declared("adverse")),
  /** Graph performance harness's static server (dev/tooling/graph-performance.ts). */
  perf: port("VAULTSPEC_DEV_PERF_PORT", declared("perf")),
  /** Visual review desk - `just dev up review`, served from frontend/dev/. */
  visualReview: port("VAULTSPEC_DEV_VISUAL_REVIEW_PORT", declared("review")),
} as const;

// Vite's dev server validates the request `Host` header as a DNS-rebinding guard
// (`server.allowedHosts`). localhost / 127.0.0.1 / [::1] are always accepted; any
// OTHER hostname is rejected with "host <name> is not allowed". The dev dashboard
// is reached from other machines over the Tailscale network BY HOSTNAME, so those
// hostnames must be whitelisted explicitly. A leading dot allows a domain and all
// of its subdomains, so ".ts.net" covers every Tailscale MagicDNS FQDN. Extend
// per-machine via VAULTSPEC_DEV_ALLOWED_HOSTS (comma-separated) without editing
// this file.
//
// ".ts.net" alone is NOT enough, because MagicDNS resolves a peer by its BARE name
// as well as its FQDN. Reaching the desk as `http://gw-workstation:<port>/` sends
// `Host: gw-workstation`, which no suffix rule matches — the request is refused
// with Vite's "add it to server.allowedHosts" message even though the machine is
// plainly on the tailnet. This machine's own hostname is therefore always allowed:
// it names THIS host, so permitting it grants no reach a rebinding attack could use
// that the FQDN rule does not already grant. Host headers are compared verbatim and
// browsers lower-case the URL authority, so the Windows upper-case form is folded.
function allowedHosts(): string[] {
  const self = hostname().toLowerCase();
  const base = [".ts.net", self, self.split(".")[0]];
  const extra = (process.env.VAULTSPEC_DEV_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
  // A bare hostname equals its own first label, so the two derived entries collapse
  // on the common case. Deduplicate rather than emit the same host twice.
  return [...new Set([...base, ...extra])];
}

/** Hostnames the SPA/lab dev servers accept in the `Host` header (Tailscale network). */
export const DEV_ALLOWED_HOSTS = allowedHosts();
