// The degradation debug switch (W03.P12.S46): every §8 state reachable in
// development. Dev-only: toggles condition overrides in the degradation
// store and, when the mock engine is active, drives its degrade() so the
// SERVED data degrades too — the matrix is exercised end-to-end, not just
// painted.
//
// W02.P06 (figma-parity-reconciliation): the dev overlay's chrome is rebuilt
// onto the semantic OKLCH token tier and the canonical Figma role/radius/
// elevation utilities (themes-are-oklch / warmth-in-tokens) — the prior raw
// rose/white Tailwind palette is replaced by the paper/ink/state and accent
// tokens, so the switch reads correctly under every theme. Behaviour and the
// dev-only gating are unchanged.

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
    <div className="pointer-events-auto fixed bottom-2 left-2 z-50 text-caption">
      {open ? (
        <div className="rounded-fg-md border border-rule bg-paper-raised/95 p-vs-2 text-ink shadow-fg-overlay backdrop-blur-sm">
          <div className="flex items-center justify-between gap-vs-3">
            <span className="text-label font-medium text-state-stale">
              degradation debug
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-ink-faint transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            >
              ×
            </button>
          </div>
          <ul className="mt-vs-1 space-y-vs-0-5">
            {CONDITIONS.map(({ key, label }) => {
              const on = Boolean(overrides?.[key]);
              return (
                <li key={key}>
                  <label className="flex items-center gap-vs-1 text-ink-muted">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        setOverride(key, e.target.checked ? true : null);
                        void driveMock(key, e.target.checked);
                      }}
                      className="accent-[var(--color-accent)]"
                    />
                    {label}
                  </label>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="mt-vs-1 text-ink-faint underline-offset-2 transition-colors hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
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
          className="rounded-fg-xs border border-rule bg-paper-raised/80 px-vs-1-5 py-vs-0-5 text-state-stale transition-colors hover:border-rule-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          title="degradation debug switch (dev only, G8.a)"
        >
          ⚒ degrade
        </button>
      )}
    </div>
  );
}
