// Live engine test client (test-integrity: online against the real surface).
//
// Every test that speaks to the engine does so through THIS — the real
// `EngineClient` over the real `vaultspec serve` spawned by
// `liveEngine.globalSetup`. There is no in-memory double: a passing test
// exercised the genuine client → wire → engine path end to end.
//
// `ENGINE_BASE_URL` / `ENGINE_TOKEN` are published by the global setup before
// any worker forks; importing this file before the setup has run is a usage
// error and throws loudly rather than silently falling back to a fake.

import { EngineClient, type FetchLike } from "../stores/server/engine";

const BASE_URL = process.env["ENGINE_BASE_URL"];
const TOKEN = process.env["ENGINE_TOKEN"];

if (!BASE_URL) {
  throw new Error(
    "ENGINE_BASE_URL is unset — liveEngine.globalSetup must spawn the engine before tests import liveClient.",
  );
}

/** The live base URL of the spawned engine (e.g. http://127.0.0.1:NNNNN). */
export const LIVE_BASE_URL: string = BASE_URL;

/**
 * The node-environment transport: bearer-authorizes every request and rewrites
 * the app-wide client's relative `/api/...` paths onto the live origin, so the
 * SAME client code that runs in the browser runs here against the real engine.
 */
export const liveTransport: FetchLike = (input, init) => {
  const headers = new Headers(init?.headers);
  if (TOKEN && !headers.has("authorization")) {
    headers.set("Authorization", `Bearer ${TOKEN}`);
  }
  const url = input.startsWith("http") ? input : `${BASE_URL}${input.replace(/^\/api/, "")}`;
  return fetch(url, { ...init, headers });
};

/** A fresh typed client bound to the live engine. */
export function createLiveClient(): EngineClient {
  return new EngineClient({ baseUrl: BASE_URL!, fetchImpl: liveTransport });
}

/** A raw authorized fetch against the live engine, for wire-shape assertions
 *  outside the typed client. `path` is engine-relative (e.g. "/graph/query"). */
export function liveFetch(path: string, init?: RequestInit): Promise<Response> {
  return liveTransport(path.startsWith("http") ? path : `${BASE_URL}${path}`, init);
}

let cachedScope: string | undefined;
let cachedDegraded: string | undefined;

/** The HEALTHY fixture scope: the default vault-bearing worktree (full vault +
 *  vaultspec workspace, all tiers up). Resolved once via /map and deterministic
 *  on the default flag so a sibling degraded worktree never shadows it. */
export async function liveScope(): Promise<string> {
  if (cachedScope) return cachedScope;
  const map = await createLiveClient().map();
  const vaulted = map.repositories.flatMap((r) => r.worktrees).filter((w) => w.has_vault);
  const healthy = vaulted.find((w) => w.is_default) ?? vaulted[0];
  if (!healthy) throw new Error("live fixture has no vault-bearing worktree");
  cachedScope = healthy.id;
  return cachedScope;
}

/** The DEGRADED fixture scope: a vault-bearing worktree with NO vaultspec
 *  workspace, so the declared tier (vaultspec-core) is genuinely down while the
 *  structural/temporal tiers still serve the graph. Use for degradation-state
 *  tests against a REAL degraded engine — never a stubbed tiers block. */
export async function liveDegradedScope(): Promise<string> {
  if (cachedDegraded) return cachedDegraded;
  const map = await createLiveClient().map();
  const degraded = map.repositories
    .flatMap((r) => r.worktrees)
    .find((w) => w.has_vault && !w.is_default);
  if (!degraded) throw new Error("live fixture has no degraded (non-default vault) worktree");
  cachedDegraded = degraded.id;
  return cachedDegraded;
}
