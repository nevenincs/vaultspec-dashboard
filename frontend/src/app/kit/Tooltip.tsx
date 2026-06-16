// Tooltip — the centralized hover/focus hint (figma-frontend-rewrite W01.P02.S05;
// binding kit board 135:2). Wraps a trigger and reveals a small popover bubble on
// hover or keyboard focus, dismissed on leave/blur/Escape. Token-pure: a raised
// paper bubble on the popover elevation with the meta type step, positioned on the
// requested side. Display-only and prop-driven — it holds only local open state,
// fetches nothing, and the trigger is wired to the bubble via aria-describedby for
// assistive tech. The bubble paints only while open so it adds no resting DOM cost.

import type { ReactNode } from "react";
import { useId, useState } from "react";

export type TooltipSide = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  /** The hint text shown in the bubble. */
  label: string;
  /** The trigger the tooltip describes. */
  children: ReactNode;
  /** Which side of the trigger the bubble appears on. Defaults to "top". */
  side?: TooltipSide;
  className?: string;
}

const SIDE_CLASS: Record<TooltipSide, string> = {
  top: "bottom-full left-1/2 mb-fg-1 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-fg-1 -translate-x-1/2",
  left: "right-full top-1/2 mr-fg-1 -translate-y-1/2",
  right: "left-full top-1/2 ml-fg-1 -translate-y-1/2",
};

export function Tooltip({
  label,
  children,
  side = "top",
  className = "",
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const show = () => setOpen(true);
  const hide = () => setOpen(false);
  return (
    <span
      className={`relative inline-flex ${className}`.trim()}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(e) => {
        if (e.key === "Escape") hide();
      }}
    >
      <span aria-describedby={open ? id : undefined} className="inline-flex">
        {children}
      </span>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-fg-sm border border-rule bg-paper-raised px-fg-1-5 py-fg-0-5 text-meta text-ink shadow-fg-popover ${SIDE_CLASS[side]}`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
