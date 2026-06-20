// Code Connect — Segment (single segmented-control option primitive).
import figma from "@figma/code-connect";

import { Segment } from "../../src/app/kit/Segment";
import { SegmentedToggle } from "../../src/app/kit/SegmentedToggle";

figma.connect(Segment, "<MIRROR>?node-id=154-100", {
  example: () => (
    <SegmentedToggle value="tree" onChange={() => {}} ariaLabel="Mode">
      <Segment value="tree">Tree</Segment>
    </SegmentedToggle>
  ),
});
