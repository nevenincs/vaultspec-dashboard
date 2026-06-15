import type { Meta, StoryObj } from "@storybook/react-vite";

import { CommandPalette } from "../palette/CommandPalette";
import { ContextMenuHost } from "../menu/ContextMenuHost";

/**
 * Islands / palette / menu region gallery (plan W01.P07.S32). The overlay chrome —
 * command palette and context-menu host — rendered against the mockEngine wire (see
 * .storybook/preview) for Figma seeding. These mount as overlay hosts (the palette and
 * menu reveal on trigger), so the story documents their presence in the gallery.
 *
 * The island surfaces proper (HoverCard, NodeInterior, *Layer) require a live node model
 * / scene handle and are seeded from a selected node rather than in isolation; they are
 * covered through their existing .render.test.tsx fixtures.
 */
const meta: Meta = { title: "Chrome/Overlays" };
export default meta;

export const Palette: StoryObj = {
  name: "CommandPalette",
  render: () => <CommandPalette />,
};
export const ContextMenu: StoryObj = {
  name: "ContextMenuHost",
  render: () => <ContextMenuHost />,
};
