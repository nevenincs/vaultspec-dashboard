// Code Connect — WorkTab (right-rail pipeline / work status tab).
import figma from "@figma/code-connect";

import { WorkTab } from "../../src/app/right/WorkTab";

figma.connect(WorkTab, "<MIRROR>?node-id=137-40", {
  example: () => <WorkTab />,
});
