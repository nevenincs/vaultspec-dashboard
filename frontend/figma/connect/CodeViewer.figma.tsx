// Code Connect — CodeViewer (read-only syntax-highlighted file viewer).
import figma from "@figma/code-connect";

import { CodeViewer } from "../../src/app/viewer/CodeViewer";

figma.connect(CodeViewer, "<MIRROR>?node-id=270-927", {
  example: () => <CodeViewer content={{} as never} />,
});
