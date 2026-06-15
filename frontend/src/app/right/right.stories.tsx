import type { Meta, StoryObj } from "@storybook/react-vite";

import { ChangesOverview } from "./ChangesOverview";
import { NowStrip } from "./NowStrip";
import { OpsPanel } from "./OpsPanel";
import { SearchTab } from "./SearchTab";
import { WorkTab } from "./WorkTab";

/**
 * Right-rail (activity) region gallery (plan W01.P07.S30). The review/activity surfaces,
 * rendered against the mockEngine wire (see .storybook/preview) for Figma seeding.
 */
const meta: Meta = { title: "Chrome/Right rail" };
export default meta;

export const Changes: StoryObj = {
  name: "ChangesOverview",
  render: () => <ChangesOverview />,
};
export const Now: StoryObj = { name: "NowStrip", render: () => <NowStrip /> };
export const Ops: StoryObj = { name: "OpsPanel", render: () => <OpsPanel /> };
export const Search: StoryObj = { name: "SearchTab", render: () => <SearchTab /> };
export const Work: StoryObj = { name: "WorkTab", render: () => <WorkTab /> };
