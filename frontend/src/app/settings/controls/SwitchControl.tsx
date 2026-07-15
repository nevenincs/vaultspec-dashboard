// Binary on/off switch for a boolean setting (dashboard-settings W03.P07).
// An ARIA switch button toggling the `"true"`/`"false"` wire value. The on/off
// state reads by SHAPE (the knob position + the filled track) plus the accent,
// so it is legible without relying on hue alone.
//
// W02.P06 (figma-parity-reconciliation): rebuilt faithfully to the binding Figma
// Kit Switch primitive (137:28) on the canonical Figma radius/elevation scales —
// the pill track takes rounded-fg-pill and the knob shadow takes shadow-fg-raised
// in place of the legacy alias shims; the knob stays a perfect circle.

import { deriveSettingsSwitchControlView } from "../../../stores/view/settingsControls";
import type { ControlProps } from "./types";

export function SwitchControl({ label, value, onChange, disabled, id }: ControlProps) {
  const view = deriveSettingsSwitchControlView(value);
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={view.checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(view.nextValue)}
      className={view.buttonClassName}
    >
      <span aria-hidden className={view.knobClassName} />
    </button>
  );
}
