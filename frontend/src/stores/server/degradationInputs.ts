// Degradation condition inputs (dashboard-layer-ownership / F-M3): deriving the
// degradation conditions reads the per-tier `tiers` block off the status
// snapshot, so it lives in the stores layer — the SOLE wire client and the only
// place permitted to read the raw `tiers` block. The app's degradation matrix
// (`app/degradation/matrix.ts`) consumes these derived inputs and maps them to
// per-surface states (the §8 table); it no longer reads `tiers` itself.

import { useMemo } from "react";

import { readTierAvailability, type EngineStatus } from "./engine";
import { useLiveStatusStore } from "./liveStatus";
import { useEngineStatus } from "./queries";

// --- conditions -------------------------------------------------------------------

export interface DegradationInputs {
  ragDown: boolean;
  dateMandateMissing: boolean;
  brokenLinkCount: number;
  streamLost: boolean;
  noVault: boolean;
}

export const HEALTHY: DegradationInputs = {
  ragDown: false,
  dateMandateMissing: false,
  brokenLinkCount: 0,
  streamLost: false,
  noVault: false,
};

/**
 * Live signals the status snapshot cannot carry, injected by the surface-states
 * hook from the stores-owned live-connection slice (ADR D4): the runtime stream
 * connection and the broken-link count over the held slice. Keeping these as
 * parameters keeps `deriveInputs` pure and testable.
 */
export interface LiveSignals {
  /** null = no stream expected yet, true = connected, false = lost. */
  streamConnected?: boolean | null;
  /** Broken structural edges in the held slice. */
  brokenLinkCount?: number;
}

/** Derive the live conditions from the status snapshot plus the live signals.
 *  The `tiers` block read lives here in the stores layer, never in the app. */
export function deriveInputs(
  status: EngineStatus | undefined,
  live: LiveSignals = {},
): DegradationInputs {
  const semanticDegraded =
    status === undefined || readTierAvailability(status.tiers, ["semantic"]).degraded;
  return {
    ragDown:
      semanticDegraded ||
      (status.rag !== undefined && status.rag.service !== "running"),
    dateMandateMissing: status?.degradations.includes("date-mandate") ?? false,
    // No longer hardwired (GUI finding 036): a count over the held slice's
    // broken structural edges, and an explicit stream disconnect.
    brokenLinkCount: live.brokenLinkCount ?? 0,
    streamLost: live.streamConnected === false,
    noVault: status !== undefined && status.nodes === 0,
  };
}

/** Stores hook: derive the app degradation inputs from status + live signals. */
export function useDegradationInputs(): DegradationInputs {
  const status = useEngineStatus();
  const streamConnected = useLiveStatusStore((s) => s.streamConnected);
  const brokenLinkCount = useLiveStatusStore((s) => s.brokenLinkCount);
  // Referential stability (infinite-loop fix): a fresh inputs object every render
  // churns every useSurfaceStates consumer (Stage/Timeline/Playhead) and, via the
  // live broken-link write, the liveStatus useSyncExternalStore snapshot — the
  // "getSnapshot should be cached" max-depth loop. Memo on the primitive inputs.
  return useMemo(
    () => deriveInputs(status.data, { streamConnected, brokenLinkCount }),
    [status.data, streamConnected, brokenLinkCount],
  );
}
