// Code Connect — LeftRail (the coarse-to-fine scope rail composition).
import figma from "@figma/code-connect";

import { LeftRail } from "../../src/app/left/LeftRail";

figma.connect(LeftRail, "<MIRROR>?node-id=244-750", {
  example: () => <LeftRail />,
});
