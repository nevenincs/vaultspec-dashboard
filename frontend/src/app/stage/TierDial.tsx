// The tier dial (canvas-controls ADR) — the signature trust control and the
// family's anchor: four tier toggles in the fixed product order, each carrying
// its bespoke domain mark from the shared mark registry (the same silhouette
// source the canvas texture seam consumes) and passing the 14px
// grayscale-by-shape gate, with hue as redundant reinforcement only. Each
// temporal/semantic tier exposes a per-tier confidence floor slider mapped to
// the engine's float 0..1 grammar ("only what's certain" ↔ "everything you
// suspect"); the readout uses tabular numerals. In time-travel mode the
// semantic tier renders INAPPLICABLE — disabled, marked, with the "semantic is
// about now" copy — a designed state, not a gap. When rag is down the semantic
// tier renders OFFLINE — its degradation truth read through the stores
// availability selector, never the raw tiers block. The dial never errors.

import { TierMark } from "../../scene/field/markComponents";
import { useGraphSliceAvailability } from "../../stores/server/queries";
import type { TierName } from "../../stores/view/filters";
import { useFilterStore } from "../../stores/view/filters";
import { useViewStore } from "../../stores/view/viewStore";
import { useActiveScope } from "./Stage";

/** Fixed tier order — the product-wide encoding. Marks come from the shared
 *  registry (`TierMark`); identity is carried by mark SHAPE first, hue is
 *  redundant reinforcement so the dial reads in grayscale. */
export const TIER_ORDER: { tier: TierName; label: string }[] = [
  { tier: "declared", label: "declared" },
  { tier: "structural", label: "structural" },
  { tier: "temporal", label: "temporal" },
  { tier: "semantic", label: "semantic" },
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
  const granularity = useViewStore((s) => s.granularity);
  const scope = useActiveScope();
  // Degradation truth (rag down → semantic offline) reaches the dial only as a
  // derived stores selector, never by parsing a wire envelope.
  const availability = useGraphSliceAvailability(scope, granularity);
  const semanticDegraded = availability.degradedTiers.includes("semantic");

  return (
    <fieldset
      className="flex items-center gap-fg-2 text-label"
      aria-label="tier dial"
      data-tier-dial
    >
      {TIER_ORDER.map(({ tier, label }) => {
        const inapplicable = isTierInapplicable(tier, timelineMode);
        // Semantic offline (rag down) is a designed degraded state: the toggle
        // disables and reads "offline", never an error.
        const offline = tier === "semantic" && semanticDegraded && !inapplicable;
        const blocked = inapplicable || offline;
        const on = tiers[tier] && !blocked;
        const stateLabel = inapplicable
          ? "inapplicable while time travelling"
          : offline
            ? "offline — rag is not available"
            : on
              ? "on"
              : "off";
        return (
          <span key={tier} className="flex items-center gap-fg-1">
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={`${label} tier`}
              aria-disabled={blocked || undefined}
              disabled={blocked}
              data-tier={tier}
              data-state={
                inapplicable ? "inapplicable" : offline ? "offline" : on ? "on" : "off"
              }
              title={
                inapplicable
                  ? "semantic is about now — inapplicable while time travelling"
                  : offline
                    ? "semantic is offline — rag is not available"
                    : `${label} tier ${stateLabel}`
              }
              onClick={() => setTier(tier, !tiers[tier])}
              className={`flex items-center gap-fg-1 rounded-fg-xs border px-fg-1-5 py-fg-0-5 transition-colors duration-ui-fast ease-settle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                blocked
                  ? "cursor-not-allowed border-dashed border-rule text-ink-faint"
                  : on
                    ? "border-rule-strong bg-paper-sunken text-ink"
                    : "border-rule text-ink-faint hover:border-rule-strong hover:text-ink-muted"
              }`}
            >
              {/* Mark shape carries the tier identity (grayscale-safe); the
                  on/off ring below is the non-color active cue. */}
              <TierMark tier={tier} size={14} title={`${label} tier mark`} />
              <span>{label}</span>
              {offline && (
                <span className="text-caption text-state-stale">offline</span>
              )}
            </button>
            {(tier === "temporal" || tier === "semantic") && !blocked && on && (
              <span className="flex items-center gap-fg-1">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={minConfidence[tier] ?? 0}
                  aria-label={`${label} confidence floor`}
                  aria-valuetext={`${Math.round((minConfidence[tier] ?? 0) * 100)} percent`}
                  title={`min confidence ${Math.round((minConfidence[tier] ?? 0) * 100)}%`}
                  onChange={(e) => setMinConfidence(tier, Number(e.target.value))}
                  className="h-1 w-14 accent-accent"
                />
                <span
                  data-tabular
                  className="w-7 text-right text-caption tabular-nums text-ink-faint"
                >
                  {Math.round((minConfidence[tier] ?? 0) * 100)}%
                </span>
              </span>
            )}
          </span>
        );
      })}
    </fieldset>
  );
}
