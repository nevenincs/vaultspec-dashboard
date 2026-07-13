// RailSection — the ONE collapsible section header used by BOTH rails (the right
// rail's OPEN PLANS / OPEN PRS / RECENT COMMITS and the left rail's Features /
// Documents). It is the single composition of the canonical fold + the eyebrow
// label, so a section header reads IDENTICALLY across the whole frontend: same
// padding (px-fg-1 py-fg-1-5), same flush hover wash, same twisty size, same
// UPPERCASE eyebrow with its inline count. Surfaces must compose this instead of
// re-invoking FoldSection with their own header padding/label casing
// (design-system-is-centralized) — that ad-hoc reimplementation is exactly the
// drift this component removes.
//
// The header button is fully pass-through (`headerRef` + `headerProps`) so a rail
// that drives roving-tabindex keyboard navigation (the left scope rail) can own the
// nav model without this component knowing it; a rail that does not (the activity
// rail) simply omits them. `labelProps` forwards to the eyebrow for per-surface
// data hooks. Section metrics/classes are the shared `RAIL_SECTION_*` constants.

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, Ref } from "react";

import { FoldSection, SectionLabel } from "../kit";
import {
  RAIL_SECTION_BODY_CLASS,
  RAIL_SECTION_HEADER_CLASS,
  STATUS_SECTION_TWISTY_PX,
} from "../../stores/view/statusTabChrome";

export interface RailSectionProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "title" | "onToggle"
> {
  /** The section title — rendered as the centralized UPPERCASE eyebrow. */
  title: string;
  /** Optional trailing count rendered inside the eyebrow (e.g. "OPEN PLANS 3"). */
  count?: number;
  /** Resting open/closed state — owned by the caller's disclosure store. */
  open: boolean;
  /** Toggle intent — the caller flips its own state. */
  onToggle: () => void;
  /** id for the body region; paired with the header's aria-controls. */
  bodyId: string;
  /** Whether the body content is shown when open (defaults to true). */
  bodyVisible?: boolean;
  /** Header-button ref forwarded for roving-tabindex nav (left rail). */
  headerRef?: Ref<HTMLButtonElement>;
  /** Extra header-button props (tabIndex, onFocus, onKeyDown…) for nav. */
  headerProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  /** Extra props forwarded to the eyebrow label (e.g. a `data-*` hook). */
  labelProps?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string>;
  /** Content rendered as a sibling of the header button (e.g. the coarse-pointer
   *  `RowMenuDisclosure` for a menu-bearing section header) — never nested inside
   *  it. Omitted callers keep the plain header unchanged. */
  headerTrailingSibling?: ReactNode;
  children: ReactNode;
}

export function RailSection({
  title,
  count,
  open,
  onToggle,
  bodyId,
  bodyVisible = true,
  headerRef,
  headerProps,
  labelProps,
  headerTrailingSibling,
  children,
  ...rest
}: RailSectionProps) {
  return (
    <FoldSection
      open={open}
      onToggle={onToggle}
      bodyId={bodyId}
      twistyPx={STATUS_SECTION_TWISTY_PX}
      headerClassName={RAIL_SECTION_HEADER_CLASS}
      bodyClassName={RAIL_SECTION_BODY_CLASS}
      headerRef={headerRef}
      headerProps={headerProps}
      headerTrailingSibling={headerTrailingSibling}
      label={
        <SectionLabel count={count} {...labelProps}>
          {title}
        </SectionLabel>
      }
      {...rest}
    >
      {bodyVisible ? children : null}
    </FoldSection>
  );
}
