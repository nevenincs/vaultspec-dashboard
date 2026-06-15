// The shared control contract for the schema-driven settings kit
// (dashboard-settings W03.P07). Every control renders one declared setting and
// speaks the STRING wire value on both ends: it receives the current effective
// string value and emits the next string value, so the dialog persists exactly
// what the engine validates. Typing (bool/integer/enum) is decoded/encoded at
// the control boundary, never leaked into the wire shape.

import type { SettingDef } from "../../../stores/server/engine";

export interface ControlProps {
  /** The declared setting (carries type, constraints, label, unit, etc.). */
  def: SettingDef;
  /** The current effective string value. */
  value: string;
  /** Emit the next string value to persist. */
  onChange: (next: string) => void;
  /** Disable interaction (e.g. while a write is in flight). */
  disabled?: boolean;
  /** DOM id for label association (the field row wires this to its <label>). */
  id?: string;
}
