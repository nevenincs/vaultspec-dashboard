// Code Connect — SearchField (controlled search input primitive).
import figma from "@figma/code-connect";

import { SearchField } from "../../src/app/kit/SearchField";

figma.connect(SearchField, "<MIRROR>?node-id=136-30", {
  example: () => (
    <SearchField value="" onChange={() => {}} placeholder="Search documents..." />
  ),
});
