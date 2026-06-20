// Code Connect — ListRow (grouped list-row primitive).
import figma from "@figma/code-connect";

import { ListRow } from "../../src/app/kit/ListRow";

figma.connect(ListRow, "<MIRROR>?node-id=137-21", {
  example: () => <ListRow selected>Graph layout catalog</ListRow>,
});
