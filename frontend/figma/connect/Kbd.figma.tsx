// Code Connect — Kbd (keyboard keycap primitive).
import figma from "@figma/code-connect";

import { Kbd } from "../../src/app/kit/Kbd";

figma.connect(Kbd, "<MIRROR>?node-id=145-52", {
  example: () => <Kbd>K</Kbd>,
});
