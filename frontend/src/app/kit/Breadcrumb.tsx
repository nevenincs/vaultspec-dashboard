// Ordered path trail. The final segment marks the current location; preceding
// segments may navigate to ancestors.

import { DecorativeGlyph } from "./DecorativeGlyph";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";

export interface BreadcrumbItem {
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className = "" }: BreadcrumbProps) {
  const resolveMessage = useLocalizedMessageResolver();
  return (
    <nav
      aria-label={resolveMessage({ key: "common:accessibility.breadcrumb" }).message}
      className={className || undefined}
    >
      <ol className="flex min-w-0 items-center gap-fg-1-5 text-[0.8125rem] leading-[1.4] text-ink-muted">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            // Keep ancestors whole and truncate only the current segment.
            <li
              key={`${item.label}-${i}`}
              className={`flex items-center gap-fg-1-5 ${isLast ? "min-w-0" : "shrink-0"}`}
            >
              {isLast ? (
                <span aria-current="page" className="truncate font-medium text-ink">
                  {item.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={item.onSelect}
                  disabled={item.disabled}
                  className="whitespace-nowrap rounded-fg-xs text-ink-muted transition-colors duration-ui-fast ease-settle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:text-ink-faint disabled:hover:text-ink-faint"
                >
                  {item.label}
                </button>
              )}
              {!isLast && (
                <DecorativeGlyph name="slash" className="shrink-0 text-ink-faint" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
