// The control registry (dashboard-settings W03.P07): the one place a declared
// UI-hint control kind maps to its renderer. Adding a setting that reuses an
// existing control kind needs NO change here; adding a NEVER-SEEN control kind
// is one entry plus one new control component — the bounded extension cost the
// schema-driven design promises.

import type { ComponentType } from "react";

import type { SettingControlKind } from "../../../stores/server/engine";
import { EnumControl } from "./EnumControl";
import { KeybindingControl } from "./KeybindingControl";
import { NumberControl } from "./NumberControl";
import { SwitchControl } from "./SwitchControl";
import { TextControl } from "./TextControl";
import type { ControlProps } from "./types";

/** Control kinds the settings DIALOG renders. `graph_controls` is excluded — it is
 *  edited from the graph-controls overlay panel, not the dialog (the dialog filters
 *  it out upstream; graph-control-standardisation). */
type DialogControlKind = Exclude<SettingControlKind, "graph_controls">;

/** The kind → renderer map, total over the dialog-rendered kinds. The adapter
 *  degrades an unknown engine control kind to `text`, and a non-dialog kind
 *  (graph_controls) is filtered upstream, so the `?? TextControl` fallback is a
 *  safety net rather than a routine path. */
export const CONTROL_RENDERERS: Record<
  DialogControlKind,
  ComponentType<ControlProps>
> = {
  segmented: EnumControl,
  switch: SwitchControl,
  text: TextControl,
  slider: NumberControl,
  keybinding: KeybindingControl,
};

/** Render the control for a declared setting by dispatching on its control kind. */
export function SettingControl(props: ControlProps) {
  const Renderer =
    CONTROL_RENDERERS[props.def.control as DialogControlKind] ?? TextControl;
  return <Renderer {...props} />;
}
