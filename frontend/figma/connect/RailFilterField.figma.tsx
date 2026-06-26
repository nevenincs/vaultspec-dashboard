// Code Connect — RailFilterField (rail feature search bar + Filters button).
import figma from "@figma/code-connect";

import { RailFilterField } from "../../src/app/left/RailFilterField";

figma.connect(RailFilterField, "<MIRROR>?node-id=636-1947", {
  example: () => <RailFilterField />,
});
