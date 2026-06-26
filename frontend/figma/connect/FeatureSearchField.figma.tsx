// Code Connect — FeatureSearchField (feature filter bar with autofill suggestions).
// Bound to the FeatureSuggestions design component (the open autofill list); the
// field renders the suggestions inline, matching display name + raw tag.
import figma from "@figma/code-connect";

import { FeatureSearchField } from "../../src/app/left/FeatureSearchField";

figma.connect(FeatureSearchField, "<MIRROR>?node-id=846-3893", {
  example: () => <FeatureSearchField />,
});
