// Dev-only crash injection (ADR D5): mirrors the degradation debug switch so
// every region boundary is reachable for adverse-condition verification
// without waiting for a real bug. Arm a region and a CrashZone placed inside
// that region's boundary throws on its next render; "clear" disarms so the
// boundary's retry can demonstrate recovery. The panel renders nothing in a
// production build.

import type { ReactNode } from "react";
import { create } from "zustand";

export type CrashRegion = "left-rail" | "stage" | "right-rail" | "timeline";

const REGIONS: CrashRegion[] = ["left-rail", "stage", "right-rail", "timeline"];

interface CrashState {
  armed: Record<string, boolean>;
  arm: (region: string) => void;
  disarm: (region: string) => void;
  disarmAll: () => void;
}

export const useCrashStore = create<CrashState>((set) => ({
  armed: {},
  arm: (region) => set((s) => ({ armed: { ...s.armed, [region]: true } })),
  disarm: (region) => set((s) => ({ armed: { ...s.armed, [region]: false } })),
  disarmAll: () => set({ armed: {} }),
}));

/**
 * Throws when its region is armed, so the surrounding region boundary catches
 * a real render error. Renders nothing otherwise. Placed inside each region's
 * boundary by the shell.
 */
export function CrashZone({ region }: { region: string }): ReactNode {
  const armed = useCrashStore((s) => s.armed[region] ?? false);
  if (armed) {
    throw new Error(`injected crash: ${region}`);
  }
  return null;
}

/** Dev-only floating panel that arms a crash in any region. */
export function CrashInjector(): ReactNode {
  const arm = useCrashStore((s) => s.arm);
  const disarmAll = useCrashStore((s) => s.disarmAll);
  if (!import.meta.env?.DEV) return null;
  return (
    <div
      data-crash-injector
      className="fixed bottom-2 left-2 z-50 flex items-center gap-1 rounded border border-rose-300 bg-rose-50/90 p-1 text-[0.625rem] text-rose-900 shadow-sm"
    >
      <span className="font-medium">crash:</span>
      {REGIONS.map((region) => (
        <button
          key={region}
          type="button"
          data-crash={region}
          onClick={() => arm(region)}
          className="rounded border border-rose-300 px-1 hover:border-rose-500"
        >
          {region}
        </button>
      ))}
      <button
        type="button"
        data-crash-clear
        onClick={disarmAll}
        className="rounded border border-stone-300 px-1 text-stone-600 hover:border-stone-500"
      >
        clear
      </button>
    </div>
  );
}
