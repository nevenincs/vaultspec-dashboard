// Code Connect — TextControl (single-line text field for a string setting).
import figma from "@figma/code-connect";

import { TextControl } from "../../src/app/settings/controls/TextControl";

figma.connect(TextControl, "<MIRROR>?node-id=136-30", {
  example: () => <TextControl def={{} as never} value="" onChange={() => {}} id="x" />,
});
