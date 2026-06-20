// Code Connect — HoverCard (rich hover-bloom node status card).
import figma from "@figma/code-connect";

import { HoverCard } from "../../src/app/islands/HoverCard";

figma.connect(HoverCard, "<MIRROR>?node-id=319-1024", {
  example: () => (
    <HoverCard
      model={{ id: "doc:example", kind: "adr", title: "Example" }}
      onOpen={() => {}}
    />
  ),
});
