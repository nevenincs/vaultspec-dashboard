// Code Connect — Card (centralized surface container).
import figma from "@figma/code-connect";

import { Card } from "../../src/app/kit/Card";

figma.connect(Card, "<MIRROR>?node-id=137-4", {
  example: () => <Card>Content</Card>,
});
