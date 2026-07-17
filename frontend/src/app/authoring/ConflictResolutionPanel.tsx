// The dirty-overlap conflict resolution surface (editor-change-fidelity D12). When
// an agent applies a change to a section the user is also editing, the new base is
// held UN-adopted and each contested section is resolved here — one at a time,
// through the ONE DiffView primitive, with two plain choices. The buffer stays
// editable throughout (an edit can dissolve a conflict); nothing is ever silently
// overwritten, and the save path is disabled until every section is resolved.

import type { ReactElement } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { authoredDisplayText } from "../../platform/localization/displayText";
import { Button } from "../kit";
import { DiffView } from "./DiffView";

/** The heading label for a conflicted section — its first line with the leading ATX
 *  hashes stripped, or a generic fallback for the pseudo-section (no heading). */
function sectionHeading(text: string, fallback: string): string {
  const firstLine = text
    .split("\n", 1)[0]
    ?.replace(/^#+\s*/, "")
    .trim();
  return firstLine && firstLine.length > 0 ? firstLine : fallback;
}

function bounded(text: string) {
  return {
    text,
    truncated: false,
    total_bytes: text.length,
    returned_bytes: text.length,
  };
}

export function ConflictResolutionPanel({
  conflictKeys,
  mineByKey,
  theirsByKey,
  resolutions,
  onResolve,
  docLabel,
}: {
  conflictKeys: string[];
  mineByKey: Map<string, string>;
  theirsByKey: Map<string, string>;
  resolutions: Record<string, "mine" | "theirs">;
  onResolve: (key: string, choice: "mine" | "theirs") => void;
  docLabel: string;
}): ReactElement {
  const resolveMessage = useLocalizedMessageResolver();
  const banner = resolveMessage({
    key: "documents:localizationWave.conflict.banner",
  }).message;
  const keepMine = resolveMessage({
    key: "documents:localizationWave.conflict.keepMine",
  }).message;
  const useTheirs = resolveMessage({
    key: "documents:localizationWave.conflict.useTheirs",
  }).message;
  const untitled = resolveMessage({
    key: "documents:localizationWave.conflict.untitledSection",
  }).message;

  return (
    <div
      className="flex flex-col gap-fg-2 border-b border-rule bg-paper-sunken px-fg-3 py-fg-2"
      data-editor-conflict-panel
      role="region"
      aria-label={banner}
    >
      <p className="text-meta text-diff-remove">{banner}</p>
      {conflictKeys.map((key) => {
        const mine = mineByKey.get(key) ?? "";
        const theirs = theirsByKey.get(key) ?? "";
        const choice = resolutions[key];
        return (
          <div
            key={key}
            className="flex flex-col gap-fg-1-5 rounded-fg-xs border border-rule bg-paper px-fg-2 py-fg-1-5"
            data-conflict-section={key}
          >
            <span className="min-w-0 truncate text-label text-ink">
              {authoredDisplayText(sectionHeading(mine || theirs, untitled))}
            </span>
            <DiffView
              source="conflict-resolution"
              base={bounded(mine)}
              proposed={bounded(theirs)}
              label={docLabel}
            />
            <div className="flex flex-wrap gap-fg-2">
              <Button
                variant={choice === "mine" ? "primary" : "ghost"}
                onClick={() => onResolve(key, "mine")}
                aria-pressed={choice === "mine"}
              >
                {keepMine}
              </Button>
              <Button
                variant={choice === "theirs" ? "primary" : "ghost"}
                onClick={() => onResolve(key, "theirs")}
                aria-pressed={choice === "theirs"}
              >
                {useTheirs}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
