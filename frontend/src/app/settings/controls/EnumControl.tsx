// Segmented single-select for an enum setting (dashboard-settings W03.P07).
// Renders the declared members as an ARIA radiogroup of segments with roving
// arrow-key movement and a grayscale-safe active cue (fill + weight via the
// raised surface + medium text), mirroring the BrowserModeToggle pattern. The
// active member reads without relying on hue.
//
// W02.P06 (figma-parity-reconciliation): rebuilt faithfully to the binding Figma
// Kit SegmentedToggle primitive (137:31) on the canonical Figma radius/elevation
// scales (rounded-fg-xs track + segments, shadow-fg-raised active segment) in
// place of the legacy alias shims.

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRef } from "react";

import {
  deriveSettingsEnumControlView,
  settingsEnumKeyboardTarget,
} from "../../../stores/view/settingsControls";
import type { ControlProps } from "./types";

export function EnumControl({ def, value, onChange, disabled, id }: ControlProps) {
  const view = deriveSettingsEnumControlView(def, value);
  const segEls = useRef(new Map<string, HTMLButtonElement>());

  const onKeyDown = (index: number) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const target = settingsEnumKeyboardTarget(view.options, index, e.key);
    if (target === null) return;
    e.preventDefault();
    // Stop the consumed arrow from bubbling to the global keymap dispatcher's
    // window listener (bare arrows = graph cycling); even inside the settings
    // modal an un-stopped arrow would move the radio AND the graph selection
    // (keyboard-navigation W06.P09.S31, the Class-B widget-key isolation).
    e.stopPropagation();
    onChange(target);
    segEls.current.get(target)?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={def.label}
      id={id}
      className={view.rootClassName}
    >
      {view.options.map((option, index) => {
        return (
          <button
            key={option.value}
            ref={(el) => {
              if (el) segEls.current.set(option.value, el);
              else segEls.current.delete(option.value);
            }}
            type="button"
            role="radio"
            aria-checked={option.active}
            disabled={disabled}
            // Roving tabindex: only the active segment is in the Tab order; arrows
            // move between them (the segmented-control a11y pattern).
            tabIndex={option.tabIndex}
            onClick={() => onChange(option.value)}
            onKeyDown={onKeyDown(index)}
            className={option.className}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
