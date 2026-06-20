// Code Connect — Badge (plain pill primitive).
import figma from "@figma/code-connect";

import { Badge } from "../../src/app/kit/Chip";

figma.connect(Badge, "<MIRROR>?node-id=155-109", {
  example: () => <Badge tone="accent">L3</Badge>,
});
