import { hostname } from "node:os";

// Single source of truth for every vaultspec-dashboard dev/test server port.
//
// Other projects on this machine run their own dev/test servers, so a port left
// on a framework default (Vite's 5173) or allowed to drift to "the next free
// port" silently lands on whatever is open and collides without warning. Two
// rules keep us deterministic:
//
//   1. EXACT, NON-DEFAULT ports. Every long-lived server is pinned to a distinct
//      port in a distinctive 87xx block aligned with the engine (8767) — far
//      from the common 5173/3000/8080 defaults other tools grab.
//   2. FAIL FAST. Vite servers bind with `strictPort`, so a taken port aborts
//      the boot with a clear error instead of drifting to a neighbour. The Rust
//      engine already fails loud on a bind conflict.
//
// Each port is env-overridable for the rare case two of our own worktrees must
// run side by side. The ONE deliberate exception is the vitest live engine,
// which binds an OS-assigned ephemeral port (see liveEngine.globalSetup.ts): a
// free-port pick is the strongest anti-collision guarantee for an automated,
// possibly-parallel test process and must NOT be pinned.

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
  /** Main SPA dev server — `npm run dev` / `just serve`. */
  spa: port("VAULTSPEC_DEV_SPA_PORT", 8770),
  /** Rust engine (`vaultspec serve`) the SPA dev server proxies `/api` to. */
  engine: port("VAULTSPEC_DEV_PORT", 8767),
  /** Isolated graph-lab harness — `npm run graph:dev`. */
  graphLab: port("VAULTSPEC_DEV_GRAPH_PORT", 8775),
  /** Adverse-condition Playwright SPA (mock engine, dev affordances). */
  adverse: port("VAULTSPEC_DEV_ADVERSE_PORT", 8774),
  /** Perf Playwright SPA. */
  perf: port("VAULTSPEC_DEV_PERF_PORT", 8776),
  /**
   * Engine backing the visual review desk. SEPARATE from the developer's own engine
   * (`engine`, 8767) on purpose: the desk's engine runs with demo-condition
   * simulation enabled and points at the committed demo corpus, so pointing the desk
   * at the working engine would both contaminate the review with live data and put
   * simulated outages in front of someone trying to use the app.
   */
  demoEngine: port("VAULTSPEC_DEV_DEMO_ENGINE_PORT", 8778),
  /**
   * Second demo engine, serving the EMPTY corpus that backs the review desk's `empty`
   * condition. It is a separate engine rather than a flag because "empty" is a
   * property of the CORPUS, not of a request: the honest way to render an empty state
   * is to let the engine genuinely compute one over a vault with no documents. The
   * alternative — blanking collections in a response — produces incoherent payloads
   * (engine-computed counts disagreeing with the emptied arrays they summarise) and
   * would be exactly the faked wire the wire-contract rule forbids.
   */
  demoEngineEmpty: port("VAULTSPEC_DEV_DEMO_ENGINE_EMPTY_PORT", 8779),
  /** Visual review surface — `npm run dev:visual-review`, served from frontend/dev/. */
  visualReview: port("VAULTSPEC_DEV_VISUAL_REVIEW_PORT", 8777),
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
// as well as its FQDN. Reaching the desk as `http://gw-workstation:8777/` sends
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
