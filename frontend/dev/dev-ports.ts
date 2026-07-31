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
  /** Main SPA dev server — `npm run dev` / `just dev serve`. */
  spa: port("VAULTSPEC_DEV_SPA_PORT", 8770),
  /** Rust engine (`vaultspec serve`) the SPA dev server proxies `/api` to. */
  engine: port("VAULTSPEC_DEV_PORT", 8767),
  /** Isolated graph-lab harness — `npm run graph:dev`. */
  graphLab: port("VAULTSPEC_DEV_GRAPH_PORT", 8775),
  /** Adverse-condition Playwright SPA (mock engine, dev affordances). */
  adverse: port("VAULTSPEC_DEV_ADVERSE_PORT", 8774),
  /** Perf Playwright SPA. */
  perf: port("VAULTSPEC_DEV_PERF_PORT", 8776),
} as const;

// Vite's dev server validates the request `Host` header as a DNS-rebinding guard
// (`server.allowedHosts`). localhost / 127.0.0.1 / [::1] are always accepted; any
// OTHER hostname is rejected with "host <name> is not allowed". The dev dashboard
// is reached from other machines over the Tailscale network BY HOSTNAME, so those
// hostnames must be whitelisted explicitly. A leading dot allows a domain and all
// of its subdomains, so ".ts.net" covers every Tailscale MagicDNS FQDN. Extend
// per-machine via VAULTSPEC_DEV_ALLOWED_HOSTS (comma-separated) without editing
// this file.
function allowedHosts(): string[] {
  const base = ["gw-workstation", ".ts.net"];
  const extra = (process.env.VAULTSPEC_DEV_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
  return [...base, ...extra];
}

/** Hostnames the SPA/lab dev servers accept in the `Host` header (Tailscale network). */
export const DEV_ALLOWED_HOSTS = allowedHosts();
