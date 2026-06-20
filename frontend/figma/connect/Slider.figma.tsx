// Code Connect — Slider (bounded numeric control primitive).
import figma from "@figma/code-connect";

import { Slider } from "../../src/app/kit/Slider";

figma.connect(Slider, "<MIRROR>?node-id=155-96", {
  example: () => (
    <Slider value={42} onChange={() => {}} label="Depth" unit="%" showValue />
  ),
});
