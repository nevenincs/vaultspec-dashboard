// StageTopbar — the 44px breadcrumb header docked at the top of the stage column
// (figma-frontend-rewrite W02.P03; board 117:2, `stage-topbar`). A single
// breadcrumb trail ("Vault › Live delta sync") composed from the centralized kit
// Breadcrumb, whose chevron separator is the sanctioned ChevronRight chrome glyph
// and whose muted/leading segments read in --color-ink-muted with the current
// location in --color-ink.
//
// Layer law: leaf chrome — it composes the kit and renders prop/static labels
// only; it fetches nothing and reads no raw `tiers`.

import { Breadcrumb } from "../kit";

export interface StageTopbarProps {
  /** The ordered breadcrumb labels, root-first. The last is the current location. */
  trail: string[];
}

export function StageTopbar({ trail }: StageTopbarProps) {
  return (
    <header className="flex h-11 shrink-0 items-center border-b border-rule bg-paper px-fg-4">
      <Breadcrumb items={trail.map((label) => ({ label }))} />
    </header>
  );
}
