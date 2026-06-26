// Code Connect — FilterMenu (unified filter flyout; binding FilterMenu 838:3906).
import figma from "@figma/code-connect";
import type { ComponentProps } from "react";

import { FilterMenu } from "../../src/app/stage/FilterMenu";

const props = <T,>() => ({}) as T;

figma.connect(FilterMenu, "<MIRROR>?node-id=838-3906", {
  example: () => <FilterMenu {...props<ComponentProps<typeof FilterMenu>>()} />,
});
