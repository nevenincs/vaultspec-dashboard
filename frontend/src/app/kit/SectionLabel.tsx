// SectionLabel — the centralized group-header eyebrow (figma-frontend-rewrite
// W01.P02.S05; binding kit board 135:2). It titles grouped list sections with an
// optional trailing count. Binds to the Reader/Eyebrow role: the caption type step,
// medium weight, widened tracking, and faint ink. Surfaces compose this instead of
// retyping the label styling per frame (design-system-is-centralized).

import type { HTMLAttributes, ReactNode } from "react";

export interface SectionLabelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Optional trailing count displayed after the section label. */
  count?: string | number;
}

export function SectionLabel({
  children,
  count,
  className = "",
  ...rest
}: SectionLabelProps) {
  return (
    <div
      className={`flex items-center gap-fg-1-5 text-caption font-medium tracking-[0.025rem] text-ink-faint ${className}`.trim()}
      {...rest}
    >
      <span className="truncate">{children}</span>
      {count != null && (
        <span data-tabular className="tabular-nums text-ink-muted">
          {count}
        </span>
      )}
    </div>
  );
}
