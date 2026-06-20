// Code Connect — RailTabs (right activity-rail tab bar).
import figma from "@figma/code-connect";

import { RailTabs } from "../../src/app/right/RailTabs";

figma.connect(RailTabs, "<MIRROR>?node-id=319-1058", {
  example: () => <RailTabs active="status" onChange={() => {}} />,
});
