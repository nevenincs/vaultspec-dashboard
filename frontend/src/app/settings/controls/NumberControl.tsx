// Slider for a bounded integer setting (dashboard-settings W03.P07). A native
// range input (drag + keyboard arrows for free) bounded by the declared min/max
// and step, with a tabular-numeral readout of the current value plus its unit.
// Emits the integer as a decimal string (the wire form).
//
// W02.P06 (figma-parity-reconciliation): bound faithfully to the binding Figma
// Kit Slider primitive (155:96). The native range track already reads its accent
// from the semantic accent token and the readout from the canonical text-label
// role utility, so no legacy alias shim remained to migrate.

import { deriveSettingsNumberControlView } from "../../../stores/view/settingsControls";
import type { ControlProps } from "./types";

export function NumberControl({ def, value, onChange, disabled, id }: ControlProps) {
  const view = deriveSettingsNumberControlView(def, value);
  return (
    <div className="flex shrink-0 items-center gap-fg-2">
      <input
        type="range"
        id={id}
        min={view.min}
        max={view.max}
        step={view.step}
        value={view.current}
        disabled={disabled}
        aria-label={def.label}
        aria-valuetext={view.ariaValueText}
        onChange={(e) => onChange(String(e.target.valueAsNumber))}
        className="w-40 accent-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50"
      />
      <span
        className="w-12 text-right text-label tabular-nums text-ink-muted"
        data-tabular
      >
        {view.readout}
      </span>
    </div>
  );
}
