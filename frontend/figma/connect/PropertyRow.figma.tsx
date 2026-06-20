// Code Connect — PropertyRow (key/value primitive).
import figma from "@figma/code-connect";

import { PropertyRow } from "../../src/app/kit/PropertyRow";

figma.connect(PropertyRow, "<MIRROR>?node-id=260-896", {
  example: () => <PropertyRow label="tier" value="L3" />,
});
