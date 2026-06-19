// Code Connect — FoldCategory (the one canonical foldable category).
// Maps the Figma FoldCategory component set (Collapsed / Expanded variants) to
// the kit FoldSection primitive: a flush twisty + label over a collapsible body,
// no border / no card background. Used by every foldable element in both rails.
import figma from "@figma/code-connect";

import { FoldSection } from "../../src/app/kit/FoldSection";

figma.connect(FoldSection, "<MIRROR>?node-id=440-1095", {
  props: {
    open: figma.enum("State", { Expanded: true, Collapsed: false }),
  },
  example: ({ open }) => (
    <FoldSection open={open} onToggle={() => {}} label="Section label">
      Body content
    </FoldSection>
  ),
});
