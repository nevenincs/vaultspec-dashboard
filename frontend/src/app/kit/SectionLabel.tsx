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
  /**
   * Eyebrow letter-case. The binding design uses UPPERCASE eyebrows in the
   * activity rail (OPEN PRS / RECENT COMMITS, Figma 599:2099) but Title-case
   * section headers in the left-rail tree ("Features" / "Documents", Figma
   * 238:600 SectionHeader 666:2158). Defaults to `uppercase` so the activity
   * rail is unchanged; the tree passes `none`.
   */
  transform?: "uppercase" | "none";
}

export function SectionLabel({
  children,
  count,
  className = "",
  transform = "uppercase",
  ...rest
}: SectionLabelProps) {
  return (
    <div
      className={`flex items-center gap-fg-1-5 text-caption font-medium ${transform === "uppercase" ? "uppercase" : "normal-case"} tracking-[0.025rem] text-ink-faint ${className}`.trim()}
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
