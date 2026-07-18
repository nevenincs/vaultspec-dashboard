// Dev-only crash injection (ADR D5, restored per the frontend-localization
// S108 closing review). The original floating CrashInjector panel was fully
// removed by the localization campaign (S243) because its rendered chrome
// carried unlocalizable internal vocabulary; this restoration keeps the
// integration-level containment proof (adverse.spec.ts) WITHOUT any rendered
// chrome: the lever is the dev-only `__crashControls` global registered in
// main.tsx — the same gate-don't-delete pattern as the locale-injection and
// live-status levers, dead-code-eliminated from production builds.
//
// Arm a region and the CrashZone placed inside that region's boundary throws
// on its next render (a REAL React render error caught by a REAL region
// boundary, never a simulation); disarm so the boundary's retry can
// demonstrate recovery. CrashZone renders nothing and is inert outside dev:
// nothing can arm it in a production build, and it refuses to throw there.

import type { ReactNode } from "react";
import { create } from "zustand";

export type CrashRegion = "left-rail" | "stage" | "right-rail" | "timeline";

interface CrashState {
  armed: Record<string, boolean>;
  arm: (region: CrashRegion) => void;
  disarm: (region: CrashRegion) => void;
  disarmAll: () => void;
}

export const useCrashStore = create<CrashState>((set) => ({
  armed: {},
  arm: (region) => set((s) => ({ armed: { ...s.armed, [region]: true } })),
  disarm: (region) => set((s) => ({ armed: { ...s.armed, [region]: false } })),
  disarmAll: () => set({ armed: {} }),
}));

/** The `__crashControls` surface main.tsx exposes in dev builds. */
export function crashControls(): Pick<CrashState, "arm" | "disarm" | "disarmAll"> {
  const { arm, disarm, disarmAll } = useCrashStore.getState();
  return { arm, disarm, disarmAll };
}

/**
 * Throws when its region is armed, so the surrounding region boundary catches
 * a real render error. Renders nothing otherwise. Placed inside each region's
 * boundary by the shell.
 */
export function CrashZone({ region }: { region: CrashRegion }): ReactNode {
  const armed = useCrashStore((s) => s.armed[region] ?? false);
  if (import.meta.env.DEV && armed) {
    throw new Error(`injected crash: ${region}`);
  }
  return null;
}
