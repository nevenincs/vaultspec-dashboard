// Hook face of the degradation matrix (W03.P12.S46): real conditions from
// the status snapshot, combined with any debug overrides, resolved through
// the §8 table.

import { useEngineStatus } from "../../stores/server/engine";
import type { SurfaceStates } from "./matrix";
import { deriveInputs, matrixFor, useDegradationStore } from "./matrix";

export function useSurfaceStates(): SurfaceStates {
  const status = useEngineStatus();
  const overrides = useDegradationStore((s) => s.overrides);
  const resolve = useDegradationStore((s) => s.resolve);
  void overrides; // subscription: overrides changing re-renders consumers
  return matrixFor(resolve(deriveInputs(status.data)));
}
