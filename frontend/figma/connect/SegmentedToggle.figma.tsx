// Code Connect — SegmentedToggle (single-select segmented control primitive).
import figma from "@figma/code-connect";

import { Segment } from "../../src/app/kit/Segment";
import { SegmentedToggle } from "../../src/app/kit/SegmentedToggle";

figma.connect(SegmentedToggle, "<MIRROR>?node-id=137-31", {
  example: () => (
    <SegmentedToggle value="tree" onChange={() => {}} ariaLabel="Mode">
      <Segment value="tree">Tree</Segment>
    </SegmentedToggle>
  ),
});
