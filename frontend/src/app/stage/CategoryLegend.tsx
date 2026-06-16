// Category legend (binding Figma stage chrome: the "category legend chip row" that
// sits under the stage toolbar, AppShell 117:2). A quiet, non-interactive key to
// the node-fill encoding: one kit `Chip` per canonical document category, each
// carrying the SAME bound scene/category color the graph nodes paint with (the
// chip's leading dot reads `var(--color-scene-category-<token>)` through the shared
// `category` vocabulary), so a pill and its nodes always agree.
//
// figma-frontend-rewrite W03.P07.S10: the legend composes the centralized kit
// `Chip` rather than hand-drawing colored pills (design-system-is-centralized), and
// the colors come only from the bound category tokens — never a literal hex
// (warmth-lives-in-tokens). Pure chrome: it reads nothing off the wire, holds no
// state, and emits no intent; it merely names the encoding.

import { Chip } from "../kit";
import type { CategoryToken } from "../kit";

/** The eight canonical scene categories, in a stable reading order, with their
 *  human display label. These are the SAME tokens the graph node fills use, so the
 *  legend is a faithful key to the canvas encoding. */
const LEGEND: { token: CategoryToken; label: string }[] = [
  { token: "research", label: "Research" },
  { token: "adr", label: "Decisions" },
  { token: "plan", label: "Plans" },
  { token: "exec", label: "Steps" },
  { token: "audit", label: "Audits" },
  { token: "feature", label: "Features" },
  { token: "code", label: "Code" },
  { token: "index", label: "Index" },
];

export function CategoryLegend() {
  return (
    <div
      className="pointer-events-auto absolute left-fg-2 top-12 z-10 flex max-w-[60%] flex-wrap items-center gap-fg-1"
      role="list"
      aria-label="category legend"
      data-category-legend
    >
      {LEGEND.map(({ token, label }) => (
        <span role="listitem" key={token}>
          <Chip category={token}>{label}</Chip>
        </span>
      ))}
    </div>
  );
}
