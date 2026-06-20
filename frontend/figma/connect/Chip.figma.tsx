// Code Connect — Chip (category pill primitive).
import figma from "@figma/code-connect";

import { Chip } from "../../src/app/kit/Chip";

figma.connect(Chip, "<MIRROR>?node-id=136-27", {
  example: () => <Chip category="feature">#feature</Chip>,
});
