// Kit Segment (figma-frontend-rewrite W01.P02 — binding Figma component kit board
// "Design System — Components" 135:2, Segment symbol). A single child of a
// `SegmentedToggle`: an ARIA radio whose active state is carried by a raised
// paper fill + medium weight (grayscale-legible, not hue-dependent). It reads its
// selection and keyboard model from the enclosing SegmentedToggle context, so it
// is never used standalone.

import { useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

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
    registerSegment,
    moveFocus,
    disabled: groupDisabled,
    fullWidth,
  } = useSegmentedContext();
  const ref = useRef<HTMLButtonElement | null>(null);
  const active = selected === value;
  const isDisabled = Boolean(disabled) || groupDisabled;

  useEffect(() => {
    registerSegment(value, ref.current);
    return () => registerSegment(value, null);
  }, [value, registerSegment]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    // stopPropagation as well as preventDefault: the one global keymap dispatcher
    // binds bare arrows to graph cycling on a window listener, so an un-stopped
    // segment arrow double-fires (switches the segment AND moves the graph
    // selection). A segment arrow is a Class-B widget key and must not reach the
    // Class-A dispatcher (keyboard-navigation W02.P05.S13).
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      moveFocus(value, 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      moveFocus(value, -1);
    }
  };

  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={active}
      disabled={isDisabled}
      title={title}
      // Roving tabindex: only the active segment is in the Tab order; arrows move
      // between segments (the segmented-control a11y pattern).
      tabIndex={active ? 0 : -1}
      onClick={() => selectSegment(value)}
      onKeyDown={onKeyDown}
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
