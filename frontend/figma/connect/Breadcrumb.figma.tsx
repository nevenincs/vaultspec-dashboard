// Code Connect — Breadcrumb (path trail primitive).
import figma from "@figma/code-connect";

import { Breadcrumb } from "../../src/app/kit/Breadcrumb";

figma.connect(Breadcrumb, "<MIRROR>?node-id=157-123", {
  example: () => <Breadcrumb items={[{ label: "Vault" }, { label: "Decisions" }]} />,
});
