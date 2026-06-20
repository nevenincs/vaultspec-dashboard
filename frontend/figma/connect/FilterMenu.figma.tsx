// Code Connect — FilterMenu (unified filter flyout; binding graph/Filter menu 217:633).
import figma from "@figma/code-connect";
import type { ComponentProps } from "react";

import { FilterMenu } from "../../src/app/stage/FilterMenu";

const props = <T,>() => ({}) as T;

figma.connect(FilterMenu, "<MIRROR>?node-id=217-633", {
  example: () => <FilterMenu {...props<ComponentProps<typeof FilterMenu>>()} />,
});
