// Hook face of the degradation matrix (W03.P12.S46): real conditions from
// the status snapshot AND the stores-owned live-connection slice (stream
// connection + broken-link count, live-state D4), combined with any debug
// overrides, resolved through the §8 table.

import { useMemo } from "react";

import { useDegradationInputs } from "../../stores/server/degradationInputs";
import { useDegradationOverrides } from "../../stores/view/degradationDebug";
import type { SurfaceStates } from "./matrix";
import { matrixFor } from "./matrix";

export function useSurfaceStates(): SurfaceStates {
  const real = useDegradationInputs();
  const overrides = useDegradationOverrides();
  // Apply dev overrides from the SAME subscribed value that drives the
  // re-render (finding 037): one source for subscription and computation, no
  // dead `void overrides` hack and no imperative `resolve()` get().
  // Memoized for referential stability so consumers don't see a fresh
  // SurfaceStates every render (infinite-loop fix).
  return useMemo(
    () => matrixFor(overrides ? { ...real, ...overrides } : real),
    [real, overrides],
  );
}
