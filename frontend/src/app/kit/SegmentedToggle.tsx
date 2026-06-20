// Kit SegmentedToggle (figma-frontend-rewrite W01.P02 — binding Figma component
// kit board "Design System — Components" 135:2, SegmentedToggle + Segment
// symbols). The CONTAINER of an N-segment single-select control: a roving-keys
// ARIA radiogroup whose track holds `Segment` children (e.g. Vault | Tree | Code).
// The active segment reads by SHAPE — a raised paper fill + medium weight — not
// by hue alone, matching the kit's other grayscale-legible state cues.
//
// Compositional: the container owns the value and the keyboard model and passes
// them to its `Segment` children through a context; `Segment` (sibling file)
// consumes it. Display-only and prop-driven — emits the next value via `onChange`.

import { createContext, useCallback, useContext, useRef } from "react";
import type { ReactNode } from "react";

interface SegmentedContextValue {
  /** The currently selected segment value. */
  value: string;
  /** Selects a segment (emits up to the container's `onChange`). */
  selectSegment: (value: string) => void;
  /** A `Segment` registers its element on mount and clears it on unmount. */
  registerSegment: (value: string, el: HTMLButtonElement | null) => void;
  /** Roving arrow-key movement from a segment in the given direction. */
  moveFocus: (from: string, dir: 1 | -1) => void;
  /** Whether the whole group is disabled. */
  disabled: boolean;
  /** When true, the track fills its container and segments share width equally. */
  fullWidth: boolean;
}

const SegmentedContext = createContext<SegmentedContextValue | null>(null);

/** Read the enclosing SegmentedToggle context; throws if a Segment is orphaned. */
export function useSegmentedContext(): SegmentedContextValue {
  const ctx = useContext(SegmentedContext);
  if (!ctx) {
    throw new Error("Segment must be rendered inside a SegmentedToggle");
  }
  return ctx;
}

export interface SegmentedToggleProps {
  /** The selected segment value (controlled). */
  value: string;
  /** Emits the next segment value on selection or arrow-key movement. */
  onChange: (value: string) => void;
  /** Accessible name for the radiogroup. */
  ariaLabel: string;
  /** `Segment` children. */
  children: ReactNode;
  disabled?: boolean;
  id?: string;
  /** Optional surface-owned placement class; segment state stays owned here. */
  className?: string;
  /** Stretch the track to its container width with equal-width segments (the
   *  binding LeftRail Vault/Tree/Code toggle, 244:750). */
  fullWidth?: boolean;
}

export function SegmentedToggle({
  value,
  onChange,
  ariaLabel,
  children,
  disabled = false,
  id,
  className = "",
  fullWidth = false,
}: SegmentedToggleProps) {
  const segments = useRef(new Map<string, HTMLButtonElement>());
  const order = useRef<string[]>([]);

  const registerSegment = useCallback(
    (segValue: string, el: HTMLButtonElement | null) => {
      if (el) {
        segments.current.set(segValue, el);
        if (!order.current.includes(segValue)) order.current.push(segValue);
      } else {
        segments.current.delete(segValue);
        order.current = order.current.filter((v) => v !== segValue);
      }
    },
    [],
  );

  const moveFocus = useCallback(
    (from: string, dir: 1 | -1) => {
      const list = order.current;
      const index = list.indexOf(from);
      if (index < 0 || list.length === 0) return;
      const next = list[(index + (dir === 1 ? 1 : list.length - 1)) % list.length]!;
      onChange(next);
      segments.current.get(next)?.focus();
    },
    [onChange],
  );

  const ctx: SegmentedContextValue = {
    value,
    selectSegment: onChange,
    registerSegment,
    moveFocus,
    disabled,
    fullWidth,
  };

  return (
    <SegmentedContext.Provider value={ctx}>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        id={id}
        className={`items-center gap-fg-0-5 rounded-fg-sm bg-paper-sunken p-fg-0-5 ${
          fullWidth
            ? "flex w-full"
            : "inline-flex shrink-0 flex-wrap border border-rule"
        } ${className}`.trim()}
        data-kit="segmented-toggle"
      >
        {children}
      </div>
    </SegmentedContext.Provider>
  );
}
