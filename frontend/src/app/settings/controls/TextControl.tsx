// Single-line text field for a string setting (dashboard-settings W03.P07).
// Emits the raw string on every edit; the engine validates length on PUT and
// the dialog surfaces a typed rejection. `maxLength` is a courtesy mirror of the
// declared constraint so the common case never round-trips a rejection.

import type { ControlProps } from "./types";

export function TextControl({ def, value, onChange, disabled, id }: ControlProps) {
  const maxLength =
    def.value_type.type === "string" ? def.value_type.max_len : undefined;
  return (
    <input
      type="text"
      id={id}
      value={value}
      disabled={disabled}
      maxLength={maxLength}
      placeholder={def.placeholder}
      aria-label={def.label}
      onChange={(e) => onChange(e.target.value)}
      className="w-48 rounded-vs-sm border border-rule bg-paper-sunken px-vs-2 py-vs-1 text-body text-ink outline-none transition-colors duration-ui-fast focus-within:border-rule-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50 placeholder:text-ink-faint"
    />
  );
}
