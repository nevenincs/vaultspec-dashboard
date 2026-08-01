// Kit Segment (figma-frontend-rewrite W01.P02 — binding Figma component kit board
// "Design System — Components" 135:2, Segment symbol). A single child of a
// `SegmentedToggle`: an ARIA radio whose active state is carried by a raised
// paper fill + medium weight (grayscale-legible, not hue-dependent). It reads its
// selection and keyboard model from the enclosing SegmentedToggle context, so it
// is never used standalone.

import type { ReactNode } from "react";

import { useSegmentedContext } from "./SegmentedToggle";

export interface SegmentProps {
  /** This segment's value; selected when it equals the toggle's value. */
  value: string;
  /** The segment's label content. */
  children: ReactNode;
  /** Disable this segment independently of the group. */
  disabled?: boolean;
  /** Optional native tooltip describing what this segment selects. */
  title?: string;
}

export function Segment({ value, children, disabled, title }: SegmentProps) {
  const {
    value: selected,
    selectSegment,
    focusZone,
    disabled: groupDisabled,
    fullWidth,
  } = useSegmentedContext();
  const active = selected === value;
  const isDisabled = Boolean(disabled) || groupDisabled;
  const focusProps = focusZone.rove(value, { disabled: isDisabled });

  return (
    <button
      ref={focusProps.ref}
      type="button"
      role="radio"
      aria-checked={active}
      disabled={isDisabled}
      title={title}
      tabIndex={focusProps.tabIndex}
      onClick={() => selectSegment(value)}
      onKeyDown={focusProps.onKeyDown}
      className={`rounded-fg-xs px-fg-2 py-fg-1 text-label transition-colors duration-ui-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50 ${
        fullWidth ? "flex flex-1 items-center justify-center" : ""
      } ${
        active
          ? "bg-paper-raised font-medium text-ink shadow-fg-raised"
          : "text-ink-faint hover:text-ink-muted"
      }`}
      data-kit="segment"
    >
      {children}
    </button>
  );
}
