// Code Connect — CodeTree (left-rail bounded, lazy code directory hierarchy).
import figma from "@figma/code-connect";

import { CodeTree } from "../../src/app/left/CodeTree";

figma.connect(CodeTree, "<MIRROR>?node-id=319-926", {
  example: () => <CodeTree />,
});
