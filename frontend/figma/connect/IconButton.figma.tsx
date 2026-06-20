// Code Connect — IconButton (glyph-only button primitive).
import figma from "@figma/code-connect";

import { IconButton } from "../../src/app/kit/IconButton";

figma.connect(IconButton, "<MIRROR>?node-id=127-39", {
  example: () => <IconButton label="Center view">+</IconButton>,
});
