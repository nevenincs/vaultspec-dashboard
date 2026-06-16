// PropertyRow — the centralized key/value row (figma-frontend-rewrite W01.P02.S05;
// binding kit board 135:2). A labelled property line used in the inspector / node
// context card (path, worktree, branch, tier): a muted-ink label on the left and a
// body-ink value on the right. Surfaces compose this instead of hand-laying a
// label/value pair per frame (design-system-is-centralized). Display-only and
// prop-driven.

import type { HTMLAttributes, ReactNode } from "react";

export interface PropertyRowProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> {
  label: ReactNode;
  /** The property value. */
  value: ReactNode;
}

export function PropertyRow({
  label,
  value,
  className = "",
  ...rest
}: PropertyRowProps) {
  return (
    <div
      className={`flex min-w-0 items-baseline justify-between gap-fg-2 py-fg-0-5 text-body ${className}`.trim()}
      {...rest}
    >
      <span className="shrink-0 text-ink-muted">{label}</span>
      <span className="min-w-0 truncate text-end text-ink">{value}</span>
    </div>
  );
}
