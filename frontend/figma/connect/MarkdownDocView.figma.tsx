// Code Connect — MarkdownDocView (read+edit markdown view; binding Reader — View mode 245:738).
import figma from "@figma/code-connect";
import type { ComponentProps } from "react";

import { MarkdownDocView } from "../../src/app/viewer/MarkdownDocView";

const props = <T,>() => ({}) as T;

figma.connect(MarkdownDocView, "<MIRROR>?node-id=245-738", {
  example: () => (
    <MarkdownDocView {...props<ComponentProps<typeof MarkdownDocView>>()} />
  ),
});
