// Kit Switch (figma-frontend-rewrite W01.P02 — binding Figma component kit board
// "Design System — Components" 135:2, Switch symbol Off/On). A standardized,
// controlled binary toggle: an ARIA switch button whose on/off state reads by
// SHAPE (knob position + filled track) plus the single accent, so it is legible
// without relying on hue alone (the warmth-in-tokens + grayscale-legibility law).
//
// Display-only and prop-driven: it holds no state and emits the next boolean
// through `onChange`.

export interface SwitchProps {
  /** Current on/off state (controlled). */
  checked: boolean;
  /** Emits the next state on toggle. */
  onChange: (checked: boolean) => void;
  /** Accessible name for the switch. */
  label: string;
  disabled?: boolean;
  id?: string;
}

export function Switch({ checked, onChange, label, disabled, id }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[1.125rem] w-8 shrink-0 items-center rounded-fg-pill border transition-colors duration-ui-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50 ${
        checked ? "border-accent bg-accent" : "border-rule bg-paper-sunken"
      }`}
      data-kit="switch"
    >
      <span
        aria-hidden
        className={`inline-block size-3.5 rounded-full bg-paper shadow-fg-raised transition-transform duration-ui-fast ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
