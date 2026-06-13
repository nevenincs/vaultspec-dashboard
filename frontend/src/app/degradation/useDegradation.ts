// Hook face of the degradation matrix (W03.P12.S46): real conditions from
// the status snapshot, combined with any debug overrides, resolved through
// the §8 table.

import { useEngineStatus } from "../../stores/server/engine";
import { useLiveStatusStore } from "../../stores/server/liveStatus";
import type { SurfaceStates } from "./matrix";
import { deriveInputs, matrixFor, useDegradationStore } from "./matrix";

export function useSurfaceStates(): SurfaceStates {
  const status = useEngineStatus();
  // Live signals the /status snapshot cannot carry (ADR D4): read from the
  // stores-owned live-connection slice so the stream-lost and broken-link
  // degradation rows derive from real state instead of the old hardwired zeros.
  const streamConnected = useLiveStatusStore((s) => s.streamConnected);
  const brokenLinkCount = useLiveStatusStore((s) => s.brokenLinkCount);
  const overrides = useDegradationStore((s) => s.overrides);
  const resolve = useDegradationStore((s) => s.resolve);
  void overrides; // subscription: overrides changing re-renders consumers
  return matrixFor(
    resolve(deriveInputs(status.data, { streamConnected, brokenLinkCount })),
  );
}
