// Assembly of every per-area specimen module, keyed by discovered surface id.
//
// One area = one module, so authoring a new area's specimens never touches another's.
// The registry joins these against the discovered inventory and surfaces any gap.

import type { SpecimenDef } from "../registry";

import { agentSpecimens } from "./agent";
import { authoringSpecimens } from "./authoring";
import { graphSpecimens } from "./graph";
import { islandsSpecimens } from "./islands";
import { leftSpecimens } from "./left";
import { onboardingSpecimens } from "./onboarding";
import { paletteSpecimens } from "./palette";
import { panelsSpecimens } from "./panels";
import { rightSpecimens } from "./right";
import { settingsSpecimens } from "./settings";
import { sceneBoundSpecimens } from "./sceneBound";
import { shellSpecimens } from "./shell";
import { stageSpecimens } from "./stage";
import { timelineSpecimens } from "./timeline";
import { viewerSpecimens } from "./viewer";

export const AREA_SPECIMENS: Readonly<Record<string, SpecimenDef>> = {
  ...agentSpecimens,
  ...authoringSpecimens,
  ...graphSpecimens,
  ...islandsSpecimens,
  ...leftSpecimens,
  ...onboardingSpecimens,
  ...paletteSpecimens,
  ...panelsSpecimens,
  ...rightSpecimens,
  ...settingsSpecimens,
  ...sceneBoundSpecimens,
  ...shellSpecimens,
  ...stageSpecimens,
  ...timelineSpecimens,
  ...viewerSpecimens,
};
