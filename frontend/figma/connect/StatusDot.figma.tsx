// Code Connect — StatusDot (category marker primitive).
import figma from "@figma/code-connect";

import { StatusDot } from "../../src/app/kit/StatusDot";

figma.connect(StatusDot, "<MIRROR>?node-id=136-20", {
  example: () => <StatusDot category="decision" label="Decision" />,
});
