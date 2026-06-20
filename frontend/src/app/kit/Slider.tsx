// Kit Slider (figma-frontend-rewrite W01.P02 — binding Figma component kit board
// "Design System — Components" 135:2, Slider symbol Default/Active). A
// standardized, controlled bounded-value control built on a native range input
// (drag + keyboard arrows for free), its track/thumb tinted by the single
// semantic accent token. An optional tabular readout shows the current value plus
// its unit.
//
// Display-only and prop-driven: it holds no state and emits the next numeric value
// through `onChange`.

export interface SliderProps {
  /** Current value (controlled). */
  value: number;
  /** Emits the next value on drag or arrow-key movement. */
  onChange: (value: number) => void;
  /** Accessible name for the slider. */
  label: string;
  min?: number;
  max?: number;
  step?: number;
  /** Unit suffix shown in the optional readout (e.g. "%"). */
  unit?: string;
  /** Show a tabular-numeral readout of the current value to the right. */
  showValue?: boolean;
  /** Stretch the track to fill its container (the binding panel-row slider) rather
   *  than the default 160px symbol width. */
  fullWidth?: boolean;
  disabled?: boolean;
  id?: string;
}

export function Slider({
  value,
  onChange,
  label,
  min = 0,
  max = 100,
  step = 1,
  unit,
  showValue = false,
  fullWidth = false,
  disabled,
  id,
}: SliderProps) {
  return (
    <div
      className={`flex shrink-0 items-center gap-fg-2 ${fullWidth ? "w-full" : ""}`.trim()}
      data-kit="slider"
    >
      <input
        type="range"
        id={id}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={unit ? `${value}${unit}` : undefined}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className={`${
          fullWidth ? "w-full" : "w-40"
        } accent-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50`}
      />
      {showValue && (
        <span
          className="w-12 text-right text-label tabular-nums text-ink-muted"
          data-kit-slider-readout
        >
          {value}
          {unit ?? ""}
        </span>
      )}
    </div>
  );
}
