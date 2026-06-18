// Code Connect — StatusTab (right-rail Status overview: location strip, open
// plans, open PRs, open issues, recent PRs, recent commits). Maps the binding
// catalog node on the LIVE file to the rebuilt surface (rightrail redesign).
import figma from "@figma/code-connect";

import { StatusTab } from "../../src/app/right/StatusTab";

figma.connect(StatusTab, "<MIRROR>?node-id=309-1066", {
  example: () => <StatusTab />,
});
