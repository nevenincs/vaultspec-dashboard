// Code Connect — Timeline (relational phase-lane lineage timeline). The
// `Timeline` component export takes only optional surface props, so the example
// is the bare element.
import figma from "@figma/code-connect";

import { Timeline } from "../../src/app/timeline/Timeline";

figma.connect(Timeline, "<MIRROR>?node-id=239-713", {
  example: () => <Timeline />,
});
