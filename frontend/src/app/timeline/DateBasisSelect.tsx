// DateBasisSelect — the timeline's date-BASIS control: which date field the range
// selector's edges and the canonical `date_range` filter key off.
//
// Owner review [msacnto1]: the Created / Edited / Updated segmented triple spent
// three permanent slots on a choice that is made once and rarely revisited, and it
// read as three competing toggles rather than one setting with a current value. It
// is now ONE dropdown — the kit `Calendar` mark, the current value, a chevron —
// opening the kit `Popover` over a `menuitemradio` list. Because both timeline
// variants and every surface that mounts them (Timeline, CompactTimeline,
// GraphPanel) compose the ONE shared `TimelineRange`, this single control is what
// all four noted surfaces render.
//
// Wire-free and prop-driven: the caller resolves every string through the
// localization runtime and owns the criterion write. Keyboard follows the ARIA menu
// model through the shared FocusZone — the menu is ONE tab stop, arrows/Home/End
// rove within it, and the consumed keys never reach the global dispatcher.

// Owner review [msbat32h]: "popup is clipped by the timeline area". It was, and the
// cause was CONTAINMENT rather than paint order: the shell timeline region carries
// `overflow-hidden` (it must — the timeline sits directly under the graph and its
// content may not spill into it), which clips any absolutely-positioned descendant
// no matter how high its z-index. Raising z-index would have treated a containment
// problem as a stacking one, and would not have worked.
//
// So the menu is PORTALED to the document body and positioned `fixed` against the
// trigger rect — the same pattern `AutocompleteCombobox` uses for the same reason.
// It re-places on resize and on any ancestor scroll (capture) so it tracks the
// trigger, and it prefers ABOVE, because this control sits at the bottom of the
// window where below is usually the wrong side.
//
// Two costs the portal incurs, both paid: `aria-owns` on the trigger re-establishes
// the ownership the accessibility tree loses when the menu stops being a DOM
// descendant, and the popover needs `ignoreSelector` so the click that toggles the
// trigger shut is not also read as an outside-pointer dismissal.

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { DropdownButton, Popover } from "../kit";
import { Calendar } from "../kit/glyphs";
import { useFocusZone } from "../chrome/useFocusZone";

/** 14px structural-chrome mark, matching the kit's other Lucide glyphs. */
const GLYPH_PX = 14;

/** Gap in px between the trigger and the portaled menu. */
const MENU_GAP = 4;

/** Floor for the menu width, preserving the previous `min-w-[11rem]`. */
const MENU_MIN_WIDTH_PX = 176;

/** The menu placement, measured from the trigger. `top` and `bottom` are
 *  exclusive: whichever side has room is set and the other stays undefined. */
interface MenuPlacement {
  left: number;
  top: number | undefined;
  bottom: number | undefined;
  minWidth: number;
}

export interface DateBasisOption {
  /** Raw criterion identity (never rendered). */
  id: string;
  /** Resolved, user-facing label. */
  label: string;
  /** Resolved hover/disabled explanation. */
  title: string;
  /** Not served by this engine or this corpus — offered, but inert with a reason. */
  disabled: boolean;
}

export interface DateBasisSelectProps {
  /** The active criterion id. */
  value: string;
  options: DateBasisOption[];
  /** Accessible name for the trigger and the menu ("Date field"). */
  ariaLabel: string;
  onSelect: (id: string) => void;
}

export function DateBasisSelect({
  value,
  options,
  ariaLabel,
  onSelect,
}: DateBasisSelectProps) {
  const [open, setOpen] = useState(false);
  const [rovingKey, setRovingKey] = useState<string | null>(null);
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const active = options.find((option) => option.id === value) ?? options[0];
  // Roving follows the keyboard cursor, NOT the selection: opening the menu parks
  // the tab stop on the current value, and arrowing away from it moves focus only
  // — the criterion is written on activation.
  const focusZone = useFocusZone({
    activeKey: rovingKey ?? value,
    onActiveKeyChange: setRovingKey,
  });
  const { focusItem } = focusZone;

  const close = useCallback(() => {
    setOpen(false);
    setRovingKey(null);
  }, []);

  // ARIA menu model: opening moves focus into the menu, onto the current value.
  useEffect(() => {
    if (open) focusItem(value);
  }, [focusItem, open, value]);

  // Measure and place the portaled menu while it is open; re-place on resize and
  // on any ancestor scroll (capture) so it stays attached to its trigger.
  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const above = rect.top - MENU_GAP * 2;
      const below = window.innerHeight - rect.bottom - MENU_GAP * 2;
      const dropBelow = above < below;
      setPlacement({
        left: rect.left,
        top: dropBelow ? rect.bottom + MENU_GAP : undefined,
        bottom: dropBelow ? undefined : window.innerHeight - rect.top + MENU_GAP,
        minWidth: Math.max(rect.width, MENU_MIN_WIDTH_PX),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  if (active === undefined) return null;

  return (
    <div className="relative shrink-0" data-timeline-date-basis ref={triggerRef}>
      <DropdownButton
        label={active.label}
        ariaLabel={ariaLabel}
        icon={<Calendar size={GLYPH_PX} />}
        open={open}
        // The menu is portaled, so it is no longer a DOM descendant of this
        // trigger; aria-owns restores the ownership the accessibility tree needs.
        ariaOwns={open ? menuId : undefined}
        onClick={() => {
          setRovingKey(null);
          setOpen((current) => !current);
        }}
      />
      {open &&
        placement !== null &&
        createPortal(
          <Popover
            open={open}
            onDismiss={close}
            ignoreSelector="[data-timeline-date-basis]"
            style={{
              position: "fixed",
              left: placement.left,
              top: placement.top,
              bottom: placement.bottom,
              minWidth: placement.minWidth,
            }}
            className="z-50 rounded-fg-md border border-rule bg-paper-raised p-fg-1 shadow-fg-overlay"
            data-timeline-date-basis-menu
          >
            <ul
              id={menuId}
              role="menu"
              aria-label={ariaLabel}
              className="flex flex-col gap-fg-0-5"
            >
              {options.map((option) => {
                const item = focusZone.rove(option.id, { disabled: option.disabled });
                return (
                  <li key={option.id} role="none">
                    <button
                      {...item}
                      type="button"
                      role="menuitemradio"
                      aria-checked={option.id === value}
                      disabled={option.disabled}
                      title={option.title}
                      data-date-basis-option={option.id}
                      onKeyDown={(event) => {
                        // The composite consumes its own navigation keys so they
                        // never reach the global keymap dispatcher.
                        item.onKeyDown(event);
                        if (event.defaultPrevented) event.stopPropagation();
                      }}
                      onClick={() => {
                        onSelect(option.id);
                        close();
                      }}
                      className="flex w-full items-center rounded-fg-sm px-fg-2 py-fg-1 text-left text-label text-ink transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-[checked=true]:bg-paper-sunken disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                    >
                      {option.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Popover>,
          document.body,
        )}
    </div>
  );
}
