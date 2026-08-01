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

import { useCallback, useEffect, useState } from "react";

import { DropdownButton, Popover } from "../kit";
import { Calendar } from "../kit/glyphs";
import { useFocusZone } from "../chrome/useFocusZone";

/** 14px structural-chrome mark, matching the kit's other Lucide glyphs. */
const GLYPH_PX = 14;

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

  if (active === undefined) return null;

  return (
    <div className="relative shrink-0" data-timeline-date-basis>
      <DropdownButton
        label={active.label}
        ariaLabel={ariaLabel}
        icon={<Calendar size={GLYPH_PX} />}
        open={open}
        onClick={() => {
          setRovingKey(null);
          setOpen((current) => !current);
        }}
      />
      {open && (
        <Popover
          open={open}
          onDismiss={close}
          className="absolute bottom-full right-0 z-40 mb-fg-1 min-w-[11rem] rounded-fg-md border border-rule bg-paper-raised p-fg-1 shadow-fg-overlay"
          data-timeline-date-basis-menu
        >
          <ul role="menu" aria-label={ariaLabel} className="flex flex-col gap-fg-0-5">
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
        </Popover>
      )}
    </div>
  );
}
