// Code Connect — FacetChipGroup (shared vocabulary-driven facet on/off chips).
import figma from "@figma/code-connect";

import { FacetChipGroup } from "../../src/app/chrome/FacetChipGroup";

figma.connect(FacetChipGroup, "<MIRROR>?node-id=136-27", {
  example: () => (
    <FacetChipGroup
      label="type"
      values={["adr", "plan"]}
      selected={["adr"]}
      onToggle={() => {}}
    />
  ),
});
