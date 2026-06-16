// Code Connect — NumberControl (slider for a bounded integer setting).
import figma from "@figma/code-connect";

import { NumberControl } from "../../src/app/settings/controls/NumberControl";

figma.connect(NumberControl, "<MIRROR>?node-id=155-96", {
  example: () => (
    <NumberControl def={{} as never} value="" onChange={() => {}} id="x" />
  ),
});
