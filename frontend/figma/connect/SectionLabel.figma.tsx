// Code Connect — SectionLabel (group header primitive).
import figma from "@figma/code-connect";

import { SectionLabel } from "../../src/app/kit/SectionLabel";

figma.connect(SectionLabel, "<MIRROR>?node-id=135-17", {
  example: () => <SectionLabel count={8}>Research</SectionLabel>,
});
