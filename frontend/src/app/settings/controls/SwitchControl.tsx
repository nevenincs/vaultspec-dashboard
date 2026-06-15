// Binary on/off switch for a boolean setting (dashboard-settings W03.P07).
// An ARIA switch button toggling the `"true"`/`"false"` wire value. The on/off
// state reads by SHAPE (the knob position + the filled track) plus the accent,
// so it is legible without relying on hue alone.

import { decodeBool } from "../../../stores/server/settingsSelectors";
import type { ControlProps } from "./types";

export function SwitchControl({ def, value, onChange, disabled, id }: ControlProps) {
  const on = decodeBool(value);
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={on}
      aria-label={def.label}
      disabled={disabled}
      onClick={() => onChange(on ? "false" : "true")}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-vs-xl border transition-colors duration-ui-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50 ${
        on ? "border-accent bg-accent" : "border-rule bg-paper-sunken"
      }`}
    >
      <span
        aria-hidden
        className={`inline-block size-3.5 rounded-full bg-paper shadow-card transition-transform duration-ui-fast ${
          on ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
