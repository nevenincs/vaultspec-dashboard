import type { Meta, StoryObj } from "@storybook/react-vite";

import { Discover } from "./Discover";
import { GraphControls } from "./GraphControls";
import { LensSelector } from "./LensSelector";
import { MinimapWidget } from "./MinimapWidget";

/**
 * Stage region gallery (plan W01.P07.S29). The central canvas controls, rendered against
 * the mockEngine wire (see .storybook/preview) for Figma seeding and parity.
 */
const meta: Meta = { title: "Chrome/Stage" };
export default meta;

export const DiscoverPanel: StoryObj = { name: "Discover", render: () => <Discover /> };
export const Lens: StoryObj = { name: "LensSelector", render: () => <LensSelector /> };
export const Minimap: StoryObj = {
  name: "MinimapWidget",
  render: () => <MinimapWidget embedded />,
};
export const Controls: StoryObj = {
  name: "GraphControls",
  render: () => <GraphControls />,
};
