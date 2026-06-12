import { useQuery } from "@tanstack/react-query";

// In development Vite proxies /api to the engine (vite.config.ts); in
// production the SPA is served by the engine itself, so the API shares the
// origin (contract §1) and the prefix collapses.
const API_BASE = import.meta.env.DEV ? "/api" : "";

/** Shape of the engine's /status scaffold payload (contract §6). */
export interface EngineStatus {
  ok: boolean;
  nodes: number;
  edges: number;
  degradations: string[];
  tiers: Record<string, { available: boolean; reason?: string }>;
}

export async function fetchEngineStatus(): Promise<EngineStatus> {
  const response = await fetch(`${API_BASE}/status`);
  if (!response.ok) {
    throw new Error(`engine /status responded ${response.status}`);
  }
  return (await response.json()) as EngineStatus;
}

/** The right rail's recovery snapshot; /stream deltas refine it later. */
export function useEngineStatus() {
  return useQuery({
    queryKey: ["engine", "status"],
    queryFn: fetchEngineStatus,
  });
}
