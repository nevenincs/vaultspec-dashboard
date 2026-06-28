// Non-hook read/write for the timeline date criterion (Issue #14) — the seam the
// context-menu "Filter by" actions (a pure resolver, no hooks) use. The criterion is
// the engine-served `timeline_date_criterion` setting (schema-driven persistence):
// selecting a criterion PUTs the global setting, and the active value + capability are
// read from the TanStack settings cache. The graph/lineage query hooks then read the
// setting (via `useTimelineDateCriterion`) and ride it as the `date_field` facet.

import { engineClient, type SettingsSchema, type SettingsState } from "./engine";
import { queryClient } from "./queryClient";
import {
  deriveTimelineDateCriterion,
  engineKeys,
  type TimelineDateCriterion,
} from "./queries";

export interface TimelineDateCriterionSnapshot {
  /** The active criterion (read from the served setting; `created` default). */
  active: TimelineDateCriterion;
  /** Whether the engine serves the setting — the gate for enabling Modified/Stamped. */
  served: boolean;
}

/** Read the active criterion + capability from the settings cache (no hooks). The
 *  criterion is a global preference, so resolution uses the global value (null scope). */
export function timelineDateCriterionSnapshot(): TimelineDateCriterionSnapshot {
  const schema = queryClient.getQueryData<SettingsSchema>(engineKeys.settingsSchema());
  const settings = queryClient.getQueryData<SettingsState>(engineKeys.settings());
  const { criterion, served } = deriveTimelineDateCriterion(schema, settings, null);
  return { active: criterion, served };
}

/** Persist the chosen criterion by PUTting the global `timeline_date_criterion`
 *  setting and updating the settings cache (mirrors `usePutSettings.onSuccess`). */
export async function setTimelineDateCriterion(
  criterion: TimelineDateCriterion,
): Promise<void> {
  const settings = await engineClient.putSettings({
    key: "timeline_date_criterion",
    value: criterion,
  });
  queryClient.setQueryData(engineKeys.settings(), settings);
  void queryClient.invalidateQueries({ queryKey: engineKeys.settings() });
}
