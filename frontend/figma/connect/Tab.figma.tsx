// Code Connect — Tab (tab-strip affordance primitive).
import figma from "@figma/code-connect";

import { Tab } from "../../src/app/kit/Tab";

figma.connect(Tab, "<MIRROR>?node-id=135-14", {
  example: () => (
    <Tab active onSelect={() => {}}>
      Status
    </Tab>
  ),
});
