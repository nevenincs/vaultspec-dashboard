// Code Connect — ProgressBar (determinate progress primitive).
import figma from "@figma/code-connect";

import { ProgressBar } from "../../src/app/kit/ProgressBar";

figma.connect(ProgressBar, "<MIRROR>?node-id=137-40", {
  example: () => <ProgressBar value={18} max={24} label="Plan progress" showValue />,
});
