// Slider for a bounded integer setting (dashboard-settings W03.P07). A native
// range input (drag + keyboard arrows for free) bounded by the declared min/max
// and step, with a tabular-numeral readout of the current value plus its unit.
// Emits the integer as a decimal string (the wire form).

import { decodeInt } from "../../../stores/server/settingsSelectors";
import type { ControlProps } from "./types";

export function NumberControl({ def, value, onChange, disabled, id }: ControlProps) {
  const range =
    def.value_type.type === "integer" ? def.value_type : { min: 0, max: 100 };
  const current = decodeInt(value, range.min);
  return (
    <div className="flex shrink-0 items-center gap-vs-2">
      <input
        type="range"
        id={id}
        min={range.min}
        max={range.max}
        step={def.step ?? 1}
        value={current}
        disabled={disabled}
        aria-label={def.label}
        aria-valuetext={`${current}${def.unit ?? ""}`}
        onChange={(e) => onChange(String(e.target.valueAsNumber))}
        className="w-40 accent-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50"
      />
      <span
        className="w-12 text-right text-label tabular-nums text-ink-muted"
        data-tabular
      >
        {current}
        {def.unit ?? ""}
      </span>
    </div>
  );
}
