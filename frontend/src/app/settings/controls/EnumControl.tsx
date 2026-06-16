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

import type { ControlProps } from "./types";

export function EnumControl({ def, value, onChange, disabled, id }: ControlProps) {
  const members = def.value_type.type === "enum" ? def.value_type.members : [];
  const segEls = useRef(new Map<string, HTMLButtonElement>());

  const onKeyDown = (index: number) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (
      e.key === "ArrowRight" ||
      e.key === "ArrowDown" ||
      e.key === "ArrowLeft" ||
      e.key === "ArrowUp"
    ) {
      e.preventDefault();
      const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
      const next = (index + (forward ? 1 : members.length - 1)) % members.length;
      const target = members[next]!;
      onChange(target);
      segEls.current.get(target)?.focus();
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={def.label}
      id={id}
      className="flex shrink-0 flex-wrap gap-fg-0-5 rounded-fg-xs border border-rule bg-paper-sunken p-fg-0-5"
    >
      {members.map((member, index) => {
        const active = member === value;
        return (
          <button
            key={member}
            ref={(el) => {
              if (el) segEls.current.set(member, el);
              else segEls.current.delete(member);
            }}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            // Roving tabindex: only the active segment is in the Tab order; arrows
            // move between them (the segmented-control a11y pattern).
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(member)}
            onKeyDown={onKeyDown(index)}
            className={`rounded-fg-xs px-fg-2 py-fg-0-5 text-label transition-colors duration-ui-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50 ${
              active
                ? "bg-paper-raised font-medium text-ink shadow-fg-raised"
                : "text-ink-faint hover:text-ink-muted"
            }`}
          >
            {member}
          </button>
        );
      })}
    </div>
  );
}
