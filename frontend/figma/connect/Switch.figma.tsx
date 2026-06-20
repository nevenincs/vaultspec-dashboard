// Code Connect — Switch (binary toggle primitive).
import figma from "@figma/code-connect";

import { Switch } from "../../src/app/kit/Switch";

figma.connect(Switch, "<MIRROR>?node-id=137-28", {
  example: () => <Switch checked onChange={() => {}} label="Enabled" />,
});
