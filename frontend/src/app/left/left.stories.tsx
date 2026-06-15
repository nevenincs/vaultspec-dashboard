import type { Meta, StoryObj } from "@storybook/react-vite";

import { BrowserRegion } from "./BrowserRegion";
import { LeftRail } from "./LeftRail";

/**
 * Left-rail region gallery (plan W01.P07.S28). Renders the scope-picker chrome against the
 * mockEngine wire (see .storybook/preview) so the surface is seedable into Figma.
 */
const meta: Meta = { title: "Chrome/Left rail" };
export default meta;

export const LeftRailSurface: StoryObj = {
  name: "LeftRail",
  render: () => <LeftRail />,
};
export const Browser: StoryObj = {
  name: "BrowserRegion",
  render: () => <BrowserRegion />,
};
