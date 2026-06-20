// Single-line text field for a string setting (dashboard-settings W03.P07).
// Emits the raw string on every edit; the engine validates length on PUT and
// the dialog surfaces a typed rejection. `maxLength` is a courtesy mirror of the
// declared constraint so the common case never round-trips a rejection.

import { deriveSettingsTextControlView } from "../../../stores/view/settingsControls";
import type { ControlProps } from "./types";

export function TextControl({ def, value, onChange, disabled, id }: ControlProps) {
  const view = deriveSettingsTextControlView(def);
  return (
    <input
      type="text"
      id={id}
      value={value}
      disabled={disabled}
      maxLength={view.maxLength}
      placeholder={def.placeholder}
      aria-label={def.label}
      onChange={(e) => onChange(e.target.value)}
      className={view.className}
    />
  );
}
