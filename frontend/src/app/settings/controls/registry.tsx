// The control registry (dashboard-settings W03.P07): the one place a declared
// UI-hint control kind maps to its renderer. Adding a setting that reuses an
// existing control kind needs NO change here; adding a NEVER-SEEN control kind
// is one entry plus one new control component — the bounded extension cost the
// schema-driven design promises.

import type { ComponentType } from "react";

import type { SettingControlKind } from "../../../stores/server/engine";
import { EnumControl } from "./EnumControl";
import { NumberControl } from "./NumberControl";
import { SwitchControl } from "./SwitchControl";
import { TextControl } from "./TextControl";
import type { ControlProps } from "./types";

/** The kind → renderer map. The adapter already degrades an unknown engine
 *  control kind to `text`, so this map is total over the client's known kinds. */
export const CONTROL_RENDERERS: Record<
  SettingControlKind,
  ComponentType<ControlProps>
> = {
  segmented: EnumControl,
  switch: SwitchControl,
  text: TextControl,
  slider: NumberControl,
};

/** Render the control for a declared setting by dispatching on its control kind. */
export function SettingControl(props: ControlProps) {
  const Renderer = CONTROL_RENDERERS[props.def.control] ?? TextControl;
  return <Renderer {...props} />;
}
