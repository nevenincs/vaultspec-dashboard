// Code Connect — Button (centralized text-button primitive).
import figma from "@figma/code-connect";

import { Button } from "../../src/app/kit/Button";

figma.connect(Button, "<MIRROR>?node-id=127-26", {
  example: () => <Button variant="secondary">Action</Button>,
});
