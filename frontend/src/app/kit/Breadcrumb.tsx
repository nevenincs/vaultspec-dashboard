// Breadcrumb — the centralized path trail (figma-frontend-rewrite W01.P02.S05;
// binding kit board 135:2 / Breadcrumb 157:123). Renders an ordered list of path
// segments separated by a "/" divider (the binding separator — Figma 157:123 and
// the reader chrome use a slash, not a chevron); the final segment is the current
// location (aria-current) and is not interactive, while preceding segments fire
// their `onSelect`. Surfaces compose this for the doc header / reader path.
// Display-only and prop-driven.

export interface BreadcrumbItem {
  label: string;
  onSelect?: () => void;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className = "" }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={className || undefined}>
      <ol className="flex min-w-0 items-center gap-fg-1-5 text-[0.8125rem] leading-[1.4] text-ink-muted">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li
              key={`${item.label}-${i}`}
              className="flex min-w-0 items-center gap-fg-1-5"
            >
              {isLast ? (
                <span aria-current="page" className="truncate font-medium text-ink">
                  {item.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={item.onSelect}
                  className="truncate rounded-fg-xs text-ink-muted transition-colors duration-ui-fast ease-settle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                >
                  {item.label}
                </button>
              )}
              {!isLast && (
                <span className="shrink-0 text-ink-faint" aria-hidden>
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
