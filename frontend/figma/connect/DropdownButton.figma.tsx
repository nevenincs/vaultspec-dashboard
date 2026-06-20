// Code Connect — DropdownButton (menu trigger primitive).
import figma from "@figma/code-connect";

import { DropdownButton } from "../../src/app/kit/DropdownButton";

figma.connect(DropdownButton, "<MIRROR>?node-id=222-640", {
  example: () => <DropdownButton label="Layout: Free" onClick={() => {}} />,
});
