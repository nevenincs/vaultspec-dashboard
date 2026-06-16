// Kit StatusDot (figma-frontend-rewrite W01.P02 — binding Figma component kit board
// "Design System — Components" 135:2, StatusDot symbol). A small category-colored
// dot — the centralized leading mark on a ListRow / Chip / legend entry. The fill
// is the bound scene/category token (the same color the graph node paints), so the
// dot and its node always agree. Decorative by default (aria-hidden); pass a
// `label` to give it an accessible name where it is the only category signal.

import type { Category } from "./category";
import { categoryColorVar, categoryToken } from "./category";

export interface StatusDotProps {
  /** The category whose bound color the dot fills with. */
  category: Category;
  /** Accessible name; when omitted the dot is decorative (aria-hidden). */
  label?: string;
  /** Dot diameter in px (default 8 — the rail/legend size). */
  size?: number;
}

export function StatusDot({ category, label, size = 8 }: StatusDotProps) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-kit="status-dot"
      data-category={categoryToken(category)}
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: categoryColorVar(category),
      }}
    />
  );
}
