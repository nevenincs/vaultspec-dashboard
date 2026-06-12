// The degradation debug switch (W03.P12.S46): every §8 state reachable in
// development. Dev-only: toggles condition overrides in the degradation
// store and, when the mock engine is active, drives its degrade() so the
// SERVED data degrades too — the matrix is exercised end-to-end, not just
// painted.

import { useState } from "react";

import { useDegradationStore } from "./matrix";

const CONDITIONS = [
  { key: "ragDown", label: "rag down" },
  { key: "dateMandateMissing", label: "date mandate missing" },
  { key: "streamLost", label: "stream lost" },
  { key: "noVault", label: "no vault in worktree" },
] as const;

async function driveMock(key: string, on: boolean): Promise<void> {
  if (import.meta.env.VITE_MOCK_ENGINE !== "1") return;
  const { getMockEngine } = await import("../../testing/mockEngine");
  const mock = getMockEngine();
  // Served-data degradation per condition (finding 035): rag-down,
  // no-vault, and date-mandate degrade what the mock SERVES; stream-lost
  // is a transport condition and remains a declared UI overlay until the
  // stream consumer's reconnect detection lands.
  if (key === "ragDown") {
    mock.degrade("semantic", on ? "rag service down (debug)" : null);
  } else if (key === "noVault") {
    mock.setNoVault(on);
  } else if (key === "dateMandateMissing") {
    mock.setLifecycleSparse(on);
  }
}

export function DegradationDebugSwitch() {
  const overrides = useDegradationStore((s) => s.overrides);
  const setOverride = useDegradationStore((s) => s.setOverride);
  const clearOverrides = useDegradationStore((s) => s.clearOverrides);
  const [open, setOpen] = useState(false);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="pointer-events-auto fixed bottom-2 left-2 z-50 text-[10px]">
      {open ? (
        <div className="rounded border border-rose-200 bg-white/95 p-2 shadow-md">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-rose-800">degradation debug</span>
            <button type="button" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          <ul className="mt-1 space-y-0.5">
            {CONDITIONS.map(({ key, label }) => {
              const on = Boolean(overrides?.[key]);
              return (
                <li key={key}>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        setOverride(key, e.target.checked ? true : null);
                        void driveMock(key, e.target.checked);
                      }}
                    />
                    {label}
                  </label>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="mt-1 text-stone-400 underline"
            onClick={() => {
              clearOverrides();
              void driveMock("ragDown", false);
              void driveMock("noVault", false);
              void driveMock("dateMandateMissing", false);
            }}
          >
            clear all
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded border border-rose-200 bg-white/80 px-1.5 py-0.5 text-rose-400"
          title="degradation debug switch (dev only, G8.a)"
        >
          ⚒ degrade
        </button>
      )}
    </div>
  );
}
