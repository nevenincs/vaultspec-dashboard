// FoldSection — the ONE canonical foldable category for the whole app shell
// (design-system-is-centralized). A disclosure twisty + a label slot over a
// collapsible body, with NO border and NO card background: the single, quiet way
// a category folds, identical in the left scope rail (feature / doc-type groups)
// and the right activity rail (Status sections). Replaces the per-surface
// bordered "pill" cards that changed background on open — there is now exactly one
// fold expression, so folding behaviour and structure are identical across rails.
//
// Controlled: the caller owns `open` and `onToggle` (each rail keeps its own
// disclosure store), so this primitive is pure chrome. The header button is fully
// pass-through (`headerRef` + `headerProps`) so a rail can drive roving-tabindex
// keyboard navigation through it without this component knowing the nav model;
// FoldSection only fixes the twisty, the clean header treatment, and the
// show/hide of the body. Colours and sizes resolve to the bound token tier — no
// raw hex, no loose font-size.

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, Ref } from "react";

import { ChevronDown, ChevronRight } from "./glyphs";

// The clean, flush header: a hover-only paper-sunken wash marks the hit target;
// there is no resting border or fill. Callers may override to set their own
// density (the dense rail rows run at h-[30px]; the roomier status sections add
// vertical padding) while keeping the same hover/focus idiom.
const FOLD_HEADER_CLASS =
  "flex w-full items-center gap-fg-1 rounded-fg-xs px-fg-1 py-fg-1 text-left text-ink transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
const FOLD_TWISTY_CLASS = "shrink-0 text-ink-faint";

export interface FoldSectionProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "onToggle"
> {
  /** Resting open/closed state — owned by the caller's disclosure store. */
  open: boolean;
  /** Toggle intent — the caller flips its own state. */
  onToggle: () => void;
  /** Header label content (a kit SectionLabel eyebrow, or a feature #tag). */
  label: ReactNode;
  /** Optional mark between the twisty and the label (e.g. a doc-type glyph). */
  leading?: ReactNode;
  /** Optional trailing header content (e.g. a right-aligned count). */
  trailing?: ReactNode;
  /** Collapsible body, mounted only while open. */
  children?: ReactNode;
  /** id for the body region; paired with the header's aria-controls. */
  bodyId?: string;
  /** Twisty glyph px (default 12 — the structural chevron one step below 14). */
  twistyPx?: number;
  /** Override the header treatment (density) while keeping the fold idiom. */
  headerClassName?: string;
  /** Extra classes on the body wrapper. */
  bodyClassName?: string;
  /** Callback/object ref forwarded to the header button (roving-tabindex nav). */
  headerRef?: Ref<HTMLButtonElement>;
  /** Extra header-button props (tabIndex, aria-*, onFocus, onKeyDown, title…). */
  headerProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  /** Content rendered as a SIBLING of the header button (never nested inside it —
   *  an interactive control, e.g. the coarse-pointer `RowMenuDisclosure`, cannot
   *  nest inside another button). Wraps the button in a flex row only when
   *  supplied, so callers that omit it keep the plain header unchanged. */
  headerTrailingSibling?: ReactNode;
}

export function FoldSection({
  open,
  onToggle,
  label,
  leading,
  trailing,
  children,
  bodyId,
  twistyPx = 12,
  headerClassName,
  bodyClassName,
  headerRef,
  headerProps,
  headerTrailingSibling,
  ...rest
}: FoldSectionProps) {
  const Twisty = open ? ChevronDown : ChevronRight;
  const headerButton = (
    <button
      ref={headerRef}
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={bodyId}
      className={headerClassName ?? FOLD_HEADER_CLASS}
      data-fold-toggle
      {...headerProps}
    >
      <Twisty size={twistyPx} aria-hidden className={FOLD_TWISTY_CLASS} />
      {leading}
      <span className="flex min-w-0 flex-1 items-center">{label}</span>
      {trailing}
    </button>
  );
  return (
    <section data-fold data-fold-open={open ? "" : undefined} {...rest}>
      {headerTrailingSibling ? (
        <div className="flex items-center">
          {headerButton}
          {headerTrailingSibling}
        </div>
      ) : (
        headerButton
      )}
      {open && (
        <div id={bodyId} className={bodyClassName} data-fold-body>
          {children}
        </div>
      )}
    </section>
  );
}
