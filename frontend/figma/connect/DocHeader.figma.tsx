// Code Connect — DocHeader (reader/viewer document header).
import figma from "@figma/code-connect";

import { DocHeader } from "../../src/app/right/DocHeader";

figma.connect(DocHeader, "<MIRROR>?node-id=283-1170", {
  example: () => (
    <DocHeader
      title="Graph layout catalog"
      trail={[{ label: "Vault" }, { label: "Decisions" }]}
      category="decision"
      categoryLabel="Decision"
      tier="L3"
    />
  ),
});
