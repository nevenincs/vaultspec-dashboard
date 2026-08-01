// @figma StateBlock · SlhonORmySdoSMTQgDWw3w · 1013:4066
// Shared degraded / empty state block (state-mode-uniformity ADR D1/D3). The two
// non-loading, non-typical modes render as a SHARED glyph (sanctioned families) in a
// themed tone plus ONE plain user-facing sentence — never the raw tier/branch reason,
// never an ad-hoc shape or a text glyph. Degraded carries the caution mark in the
// `state-stale` tone; empty a neutral glyph in `ink-faint`. Three layouts: a centered
// full-body block, a compact inline notice (the honest "showing what loaded" variant,
// framed as a sunken chip), and `bare` — the SAME inline row with no chip framing, for
// a host that is already a slim framed strip of its own (the timeline footer), where a
// nested rounded plate reads as a second, floating surface. The glyph is ONE size in
// every layout, and `icon={null}` drops it entirely for a state nested inside a surface
// that already carries its own mark. Tokens + shared glyphs only
// (ui-labels-are-user-facing / icons-from-two-families).

import type { LucideIcon } from "lucide-react";

import { Folder, TriangleAlert } from "./glyphs";

export type StateBlockMode = "degraded" | "empty";
export type StateBlockLayout = "block" | "inline" | "bare";

const GLYPH: Record<StateBlockMode, LucideIcon> = {
  degraded: TriangleAlert,
  empty: Folder,
};
const TONE: Record<StateBlockMode, string> = {
  degraded: "text-state-stale",
  empty: "text-ink-faint",
};
// ONE glyph size across every layout: a centered block state and a compact inline
// notice are the same message at different densities, so a reader comparing the two
// must not read a size change as a severity change (state-mode-uniformity).
const GLYPH_PX = 14;

export function StateBlock({
  mode,
  layout = "block",
  icon,
  title,
  message,
}: {
  mode: StateBlockMode;
  layout?: StateBlockLayout;
  /** Override the default sanctioned glyph when a surface has a more specific mark.
   *  `null` renders the sentence ALONE — for a state nested inside a surface that
   *  already carries its own mark, where a second glyph reads as a second subject. */
  icon?: LucideIcon | null;
  /** Optional eyebrow/title above the sentence (block layout only). */
  title?: string;
  message: string;
}) {
  const Glyph = icon === null ? null : (icon ?? GLYPH[mode]);
  const tone = TONE[mode];
  // Degraded politely announces (the data changed under the user); empty is static.
  const live = mode === "degraded";

  if (layout === "inline" || layout === "bare") {
    return (
      <div
        role={live ? "status" : undefined}
        aria-live={live ? "polite" : undefined}
        data-state-block={mode}
        data-state-block-layout={layout}
        className={`flex items-center gap-fg-1-5 text-meta text-ink-muted ${
          layout === "inline" ? "rounded-fg-xs bg-paper-sunken px-fg-2 py-fg-1-5" : ""
        }`}
      >
        {Glyph && <Glyph size={GLYPH_PX} className={`shrink-0 ${tone}`} aria-hidden />}
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
      {Glyph && (
        <span className={`shrink-0 ${tone}`} aria-hidden>
          <Glyph size={GLYPH_PX} />
        </span>
      )}
      {title ? <p className="text-body font-medium text-ink-muted">{title}</p> : null}
      <p className="text-meta text-ink-muted">{message}</p>
    </div>
  );
}
