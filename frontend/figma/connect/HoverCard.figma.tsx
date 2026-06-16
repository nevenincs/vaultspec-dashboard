// Code Connect — HoverCard (rich hover-bloom node status card).
import figma from "@figma/code-connect";

import { HoverCard } from "../../src/app/islands/HoverCard";

figma.connect(HoverCard, "<MIRROR>?node-id=137-4", {
  example: () => (
    <HoverCard
      model={{ id: "doc:example", kind: "adr", title: "Example" }}
      onOpen={() => {}}
    />
  ),
});
