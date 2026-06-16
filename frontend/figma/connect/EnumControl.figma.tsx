// Code Connect — EnumControl (segmented single-select for an enum setting).
import figma from "@figma/code-connect";

import { EnumControl } from "../../src/app/settings/controls/EnumControl";

figma.connect(EnumControl, "<MIRROR>?node-id=137-31", {
  example: () => (
    <EnumControl def={{} as never} value="" onChange={() => {}} id="x" />
  ),
});
