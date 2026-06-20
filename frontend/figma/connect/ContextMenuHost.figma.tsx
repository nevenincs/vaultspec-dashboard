// Code Connect — ContextMenuHost (singleton floating context-menu surface).
import figma from "@figma/code-connect";

import { ContextMenuHost } from "../../src/app/menu/ContextMenuHost";

figma.connect(ContextMenuHost, "<MIRROR>?node-id=319-960", {
  example: () => <ContextMenuHost />,
});
