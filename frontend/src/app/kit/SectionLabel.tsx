// SectionLabel — the centralized group-header eyebrow (figma-frontend-rewrite
// W01.P02.S05; binding kit board 135:2). The small uppercase label that titles a
// grouped list section (RESEARCH / DECISIONS / PLANS / STEPS / AUDITS in the left
// rail; OPEN PLANS / RECENT COMMITS in the activity rail), with an optional
// trailing count. Binds to the Reader/Eyebrow role: the caption type step, medium
// weight, uppercase, widened tracking, faint ink. Surfaces compose this instead of
// retyping an uppercase label per frame (design-system-is-centralized).

import type { HTMLAttributes, ReactNode } from "react";

export interface SectionLabelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Optional trailing count, e.g. the "N" in "OPEN PLANS — N". */
  count?: number;
}

export function SectionLabel({
  children,
  count,
  className = "",
  ...rest
}: SectionLabelProps) {
  return (
    <div
      className={`flex items-center gap-fg-1-5 text-caption font-medium uppercase tracking-[0.4px] text-ink-faint ${className}`.trim()}
      {...rest}
    >
      <span className="truncate">{children}</span>
      {count != null && (
        <span data-tabular className="tabular-nums text-ink-faint">
          {count}
        </span>
      )}
    </div>
  );
}
