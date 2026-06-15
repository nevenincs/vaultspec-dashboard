import type { Meta, StoryObj } from "@storybook/react-vite";

import { Playhead, TimeTravelChip } from "./Playhead";
import { RangeSelect } from "./RangeSelect";

/**
 * Timeline region gallery (plan W01.P07.S31). Temporal-scrub chrome, rendered against the
 * mockEngine wire (see .storybook/preview) for Figma seeding and parity.
 */
const meta: Meta = { title: "Chrome/Timeline" };
export default meta;

export const Playhead_: StoryObj = { name: "Playhead", render: () => <Playhead /> };
export const Range: StoryObj = { name: "RangeSelect", render: () => <RangeSelect /> };
export const TimeTravel: StoryObj = {
  name: "TimeTravelChip",
  render: () => <TimeTravelChip />,
};
