// Code Connect — TreeBrowser (left-rail feature/doc-type tree projection).
import figma from "@figma/code-connect";

import { TreeBrowser } from "../../src/app/left/TreeBrowser";

figma.connect(TreeBrowser, "<MIRROR>?node-id=161-164", {
  example: () => <TreeBrowser />,
});
