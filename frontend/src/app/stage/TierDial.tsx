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
import { useDashboardTierDialIntent } from "../../stores/server/dashboardTierDialIntent";
import {
  isDashboardTierInapplicable,
  useActiveScope,
  useDashboardTierDialView,
} from "../../stores/server/queries";
import type { TierName } from "../../stores/view/filters";

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
export function isTierInapplicable(tier: TierName, timeTravel: boolean): boolean {
  return isDashboardTierInapplicable(tier, timeTravel);
}

export function TierDial() {
  const scope = useActiveScope();
  const tierDialIntent = useDashboardTierDialIntent(scope);
  const view = useDashboardTierDialView(scope);

  return (
    <fieldset className={view.rootClassName} aria-label={view.ariaLabel} data-tier-dial>
      {view.rows.map((row) => {
        const { tier, label } = row;
        return (
          <span key={tier} className={row.rowClassName}>
            <button
              type="button"
              role="switch"
              aria-checked={row.on}
              aria-label={row.buttonAriaLabel}
              aria-disabled={row.blocked || undefined}
              disabled={row.blocked}
              data-tier={tier}
              data-state={row.state}
              title={row.title}
              onClick={() => {
                void tierDialIntent
                  .setTierEnabled(tier, !row.on)
                  .catch(() => undefined);
              }}
              className={row.buttonClassName}
            >
              {/* Mark shape carries the tier identity (grayscale-safe); the
                  on/off ring below is the non-color active cue. */}
              <TierMark tier={tier} size={14} title={row.markTitle} />
              <span>{label}</span>
              {row.offlineLabel && (
                <span className={row.offlineLabelClassName}>{row.offlineLabel}</span>
              )}
            </button>
            {row.showConfidence && (
              <span className={row.confidenceGroupClassName}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={row.confidenceValue}
                  aria-label={row.confidenceAriaLabel}
                  aria-valuetext={row.confidenceAriaValueText}
                  title={row.confidenceTitle}
                  onChange={(e) => {
                    if (row.confidenceTier === null) return;
                    void tierDialIntent
                      .setMinConfidence(row.confidenceTier, Number(e.target.value))
                      .catch(() => undefined);
                  }}
                  className={row.confidenceSliderClassName}
                />
                <span data-tabular className={row.confidenceReadoutClassName}>
                  {row.confidenceReadoutLabel}
                </span>
              </span>
            )}
          </span>
        );
      })}
    </fieldset>
  );
}
