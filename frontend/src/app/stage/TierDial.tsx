// The tier dial (W02.P07.S29, ADR G3.f / G4.b) — the signature filter
// control and the user's trust dial: four tier toggles with per-tier
// confidence thresholds ("show me only what's certain" ↔ "show me
// everything you suspect"). In time-travel mode the semantic tier renders
// INAPPLICABLE — a designed state, not a gap: history serves three tiers
// by design.

import type { TierName } from "../../stores/view/filters";
import { useFilterStore } from "../../stores/view/filters";
import { useViewStore } from "../../stores/view/viewStore";

/** Fixed tier order and marks — the product-wide encoding. */
export const TIER_ORDER: { tier: TierName; mark: string; label: string }[] = [
  { tier: "declared", mark: "◆", label: "declared" },
  { tier: "structural", mark: "▣", label: "structural" },
  { tier: "temporal", mark: "◷", label: "temporal" },
  { tier: "semantic", mark: "≈", label: "semantic" },
];

/** Semantic is present-only by design: inapplicable while time travelling. */
export function isTierInapplicable(
  tier: TierName,
  mode: { kind: "live" } | { kind: "time-travel"; at: number },
): boolean {
  return tier === "semantic" && mode.kind === "time-travel";
}

export function TierDial() {
  const tiers = useFilterStore((s) => s.tiers);
  const minConfidence = useFilterStore((s) => s.minConfidence);
  const setTier = useFilterStore((s) => s.setTier);
  const setMinConfidence = useFilterStore((s) => s.setMinConfidence);
  const timelineMode = useViewStore((s) => s.timelineMode);

  return (
    <fieldset
      className="flex items-center gap-2 text-[11px]"
      aria-label="tier dial"
      data-tier-dial
    >
      {TIER_ORDER.map(({ tier, mark, label }) => {
        const inapplicable = isTierInapplicable(tier, timelineMode);
        const on = tiers[tier] && !inapplicable;
        return (
          <span key={tier} className="flex items-center gap-1">
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={`${label} tier`}
              disabled={inapplicable}
              title={
                inapplicable
                  ? "semantic is about now — inapplicable while time travelling"
                  : `${label} tier ${on ? "on" : "off"}`
              }
              onClick={() => setTier(tier, !tiers[tier])}
              className={`rounded border px-1.5 py-0.5 ${
                inapplicable
                  ? "cursor-not-allowed border-dashed border-stone-200 text-stone-300"
                  : on
                    ? "border-stone-500 bg-stone-100 text-stone-900"
                    : "border-stone-200 text-stone-400"
              }`}
            >
              {mark} {label}
            </button>
            {(tier === "temporal" || tier === "semantic") && !inapplicable && on && (
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={minConfidence[tier] ?? 0}
                aria-label={`${label} confidence floor`}
                title={`min confidence ${Math.round((minConfidence[tier] ?? 0) * 100)}%`}
                onChange={(e) => setMinConfidence(tier, Number(e.target.value))}
                className="h-1 w-14 accent-stone-600"
              />
            )}
          </span>
        );
      })}
    </fieldset>
  );
}
