// Shared degraded / empty state block (state-mode-uniformity ADR D1/D3). The two
// non-loading, non-typical modes render as a SHARED glyph (sanctioned families) in a
// themed tone plus ONE plain user-facing sentence — never the raw tier/branch reason,
// never an ad-hoc shape or a text glyph. Degraded carries the caution mark in the
// `state-stale` tone; empty a neutral glyph in `ink-faint`. Two layouts: a centered
// full-body block, and a compact inline notice (the honest "showing what loaded"
// variant). Tokens + shared glyphs only (ui-labels-are-user-facing / icons-from-two-families).

import type { LucideIcon } from "lucide-react";

import { Folder, TriangleAlert } from "./glyphs";

export type StateBlockMode = "degraded" | "empty";
export type StateBlockLayout = "block" | "inline";

const GLYPH: Record<StateBlockMode, LucideIcon> = {
  degraded: TriangleAlert,
  empty: Folder,
};
const TONE: Record<StateBlockMode, string> = {
  degraded: "text-state-stale",
  empty: "text-ink-faint",
};

export function StateBlock({
  mode,
  layout = "block",
  icon,
  title,
  message,
}: {
  mode: StateBlockMode;
  layout?: StateBlockLayout;
  /** Override the default sanctioned glyph when a surface has a more specific mark. */
  icon?: LucideIcon;
  /** Optional eyebrow/title above the sentence (block layout only). */
  title?: string;
  message: string;
}) {
  const Glyph = icon ?? GLYPH[mode];
  const tone = TONE[mode];
  // Degraded politely announces (the data changed under the user); empty is static.
  const live = mode === "degraded";

  if (layout === "inline") {
    return (
      <div
        role={live ? "status" : undefined}
        aria-live={live ? "polite" : undefined}
        data-state-block={mode}
        className="flex items-center gap-fg-1-5 rounded-fg-xs bg-paper-sunken px-fg-2 py-fg-1-5 text-meta text-ink-muted"
      >
        <Glyph size={14} className={`shrink-0 ${tone}`} aria-hidden />
        <span>{message}</span>
      </div>
    );
  }

  return (
    <div
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      data-state-block={mode}
      className="flex flex-col items-center gap-fg-2 px-fg-3 py-fg-6 text-center"
    >
      <span className={`shrink-0 ${tone}`} aria-hidden>
        <Glyph size={20} />
      </span>
      {title ? <p className="text-body font-medium text-ink-muted">{title}</p> : null}
      <p className="text-meta text-ink-muted">{message}</p>
    </div>
  );
}
