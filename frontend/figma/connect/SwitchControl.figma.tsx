// Code Connect — SwitchControl (binary on/off switch for a boolean setting).
import figma from "@figma/code-connect";

import { SwitchControl } from "../../src/app/settings/controls/SwitchControl";

figma.connect(SwitchControl, "<MIRROR>?node-id=137-28", {
  example: () => (
    <SwitchControl def={{} as never} value="false" onChange={() => {}} id="x" />
  ),
});
