import type { Meta, StoryObj } from "@storybook/react-vite";

import { Discover } from "./Discover";
import { LensSelector } from "./LensSelector";
import { MinimapWidget } from "./MinimapWidget";
import { RepresentationModePanel } from "./RepresentationModePanel";

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
  render: () => <MinimapWidget />,
};
export const Representation: StoryObj = {
  name: "RepresentationModePanel",
  render: () => <RepresentationModePanel />,
};
