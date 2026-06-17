// The degradation debug switch (W03.P12.S46): every §8 state reachable in
// development. Dev-only: toggles condition overrides in the degradation store so
// the §8 UI states can be exercised against the live engine without engineering a
// real backend outage.
//
// W02.P06 (figma-parity-reconciliation): the dev overlay's chrome is rebuilt
// onto the semantic OKLCH token tier and the canonical Figma role/radius/
// elevation utilities (themes-are-oklch / warmth-in-tokens) — the prior raw
// rose/white Tailwind palette is replaced by the paper/ink/state and accent
// tokens, so the switch reads correctly under every theme.

import { useState } from "react";

import { useDegradationStore } from "./matrix";

const CONDITIONS = [
  { key: "ragDown", label: "rag down" },
  { key: "dateMandateMissing", label: "date mandate missing" },
  { key: "streamLost", label: "stream lost" },
  { key: "noVault", label: "no vault in worktree" },
] as const;

export function DegradationDebugSwitch() {
  const overrides = useDegradationStore((s) => s.overrides);
  const setOverride = useDegradationStore((s) => s.setOverride);
  const clearOverrides = useDegradationStore((s) => s.clearOverrides);
  const [open, setOpen] = useState(false);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="pointer-events-auto fixed bottom-2 left-2 z-50 text-caption">
      {open ? (
        <div className="rounded-fg-md border border-rule bg-paper-raised/95 p-fg-2 text-ink shadow-fg-overlay backdrop-blur-sm">
          <div className="flex items-center justify-between gap-fg-3">
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
          <ul className="mt-fg-1 space-y-fg-0-5">
            {CONDITIONS.map(({ key, label }) => {
              const on = Boolean(overrides?.[key]);
              return (
                <li key={key}>
                  <label className="flex items-center gap-fg-1 text-ink-muted">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        setOverride(key, e.target.checked ? true : null);
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
            className="mt-fg-1 text-ink-faint underline-offset-2 transition-colors hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            onClick={() => {
              clearOverrides();
            }}
          >
            clear all
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-fg-xs border border-rule bg-paper-raised/80 px-fg-1-5 py-fg-0-5 text-state-stale transition-colors hover:border-rule-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          title="degradation debug switch (dev only, G8.a)"
        >
          ⚒ degrade
        </button>
      )}
    </div>
  );
}
