// The composer's MODEL picker (plan S40; agent-panel-shell-integration D3;
// a2a-agent-flow D3). Row-2 RIGHT — the "how it thinks" side of the law.
//
// It renders the profiles the sibling ACTUALLY serves on `presets-list`, and
// nothing else:
//   - eligible profiles are selectable; the chosen id rides the existing
//     `run-start` `profile_id` field, so this adds no wire;
//   - ineligible profiles stay VISIBLE and disabled, carrying the sibling's own
//     `unavailable_reasons` verbatim — the truthful set, never a filtered one that
//     hides why a choice is unavailable;
//   - a MIXED-provider profile (its roles routed to different providers) is labelled
//     as mixed and expands to the per-role bindings, because collapsing it to one
//     provider name would be a label we made up.
//
// With no preset selected, or a preset that serves no profiles, there is nothing to
// choose between: the pill names the preset's `default_profile_id` if it has one and
// is disabled-with-reason. That is the honest floor, not a fallback mode.
//
// Layer ownership: dumb app chrome over `useTeamSelectorState`. No fetch.

import { useState } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { authoredDisplayText } from "../../platform/localization/displayText";
import {
  profileIsMixedProvider,
  profileProviderIds,
  type TeamProfile,
} from "../../stores/server/agent/a2aTeam";
import { DropdownButton, Popover } from "../kit";

const MSG = {
  model: "common:agent.composer.model",
  modelDefault: "common:agent.composer.modelDefault",
  modelUnavailable: "common:agent.composer.modelUnavailable",
  selectorValue: "common:agent.composer.selectorValue",
  selectorDisabled: "common:agent.composer.selectorDisabled",
  menuAria: "common:agent.composer.modelMenuAria",
  mixed: "common:agent.runHeader.mixedProvider",
} as const;

/** A profile's provider line: one provider named plainly, several named as mixed —
 *  never one invented label standing in for several. Pure, so the mixed rule is
 *  driven directly by test. */
export function profileProviderLabel(
  profile: TeamProfile,
  mixedLabel: string,
): string | null {
  const providers = profileProviderIds(profile);
  if (providers.length === 0) return null;
  if (providers.length === 1) return providers[0]!;
  return mixedLabel;
}

/** The display name for a profile, falling back to its served id. */
export function profileLabel(profile: TeamProfile): string {
  return profile.display_name && profile.display_name.length > 0
    ? profile.display_name
    : profile.id;
}

function ProfileRow({
  profile,
  selected,
  mixedLabel,
  onSelect,
}: {
  profile: TeamProfile;
  selected: boolean;
  mixedLabel: string;
  onSelect: () => void;
}) {
  // The sibling's own words for why a profile cannot be used. Joined, never
  // paraphrased — a reason we rewrite is a reason we might get wrong.
  const reason = profile.unavailable_reasons.join(" ");
  const reasonTitle = profile.eligible ? undefined : authoredDisplayText(reason);
  const provider = profileProviderLabel(profile, mixedLabel);
  const mixed = profileIsMixedProvider(profile);
  return (
    <li>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={selected}
        disabled={!profile.eligible}
        title={reasonTitle}
        data-model-profile={profile.id}
        data-model-eligible={profile.eligible ? "" : undefined}
        onClick={profile.eligible ? onSelect : undefined}
        className="flex w-full flex-col gap-fg-0-5 rounded-fg-sm px-fg-2 py-fg-1 text-left text-label text-ink transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-[checked=true]:bg-paper-sunken disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
      >
        <span className="flex min-w-0 items-baseline justify-between gap-fg-2">
          <span className="min-w-0 truncate">
            {authoredDisplayText(profileLabel(profile))}
          </span>
          {provider !== null && (
            <span className="shrink-0 text-caption text-ink-faint" data-model-provider>
              {authoredDisplayText(provider)}
            </span>
          )}
        </span>
        {/* A mixed profile shows its per-role bindings, so "mixed" is never the end
            of the story — the reader can see exactly which role goes where. */}
        {mixed && (
          <span className="flex flex-col gap-fg-0-5" data-model-assignments>
            {profile.assignments.map((assignment) => (
              <span
                key={assignment.role_id}
                className="flex min-w-0 items-baseline justify-between gap-fg-2 text-caption text-ink-faint"
              >
                <span className="min-w-0 truncate">
                  {authoredDisplayText(assignment.role_id)}
                </span>
                <span className="shrink-0">
                  {authoredDisplayText(
                    [assignment.provider_id, assignment.model_name]
                      .filter((part): part is string => !!part && part.length > 0)
                      .join(" · "),
                  )}
                </span>
              </span>
            ))}
          </span>
        )}
        {!profile.eligible && reason.length > 0 && (
          <span className="truncate text-meta text-ink-faint" data-model-reason>
            {authoredDisplayText(reason)}
          </span>
        )}
      </button>
    </li>
  );
}

export function ComposerModelPicker({
  profiles,
  selectedProfileId,
  defaultProfileId,
  onSelectProfile,
  locked,
}: {
  /** The SERVED profiles of the selected preset (empty when none are served). */
  profiles: readonly TeamProfile[];
  /** The user's explicit choice, or null to follow the preset's default. */
  selectedProfileId: string | null;
  /** The preset's served default, named by the pill when nothing is chosen. */
  defaultProfileId: string | null;
  onSelectProfile: (profileId: string | null) => void;
  locked: boolean;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const [open, setOpen] = useState(false);

  const modelLabel = resolveMessage({ key: MSG.model }).message;
  const mixedLabel = resolveMessage({ key: MSG.mixed }).message;
  const selected =
    profiles.find((profile) => profile.id === selectedProfileId) ??
    profiles.find((profile) => profile.id === defaultProfileId) ??
    profiles.find((profile) => profile.is_default) ??
    null;

  const value =
    selected !== null
      ? authoredDisplayText(profileLabel(selected))
      : defaultProfileId !== null && defaultProfileId.length > 0
        ? authoredDisplayText(defaultProfileId)
        : resolveMessage({ key: MSG.modelDefault }).message;

  // Nothing to choose between: no served profiles, or every one of them ineligible.
  const selectable = profiles.some((profile) => profile.eligible);
  const disabled = !selectable || locked;
  const reason = resolveMessage({ key: MSG.modelUnavailable }).message;
  const pill = resolveMessage({
    key: MSG.selectorValue,
    values: { selector: modelLabel, value },
  }).message;
  const ariaLabel = disabled
    ? resolveMessage({
        key: MSG.selectorDisabled,
        values: { selector: modelLabel, value, reason },
      }).message
    : pill;
  const menuAria = resolveMessage({ key: MSG.menuAria });
  const disabledTitle = disabled ? authoredDisplayText(reason) : undefined;

  return (
    <div className="relative" data-composer-model>
      <span
        title={disabledTitle}
        data-composer-model-trigger
        data-model-profile={selected?.id}
      >
        <DropdownButton
          label={value}
          open={open}
          onClick={() => setOpen((current) => !current)}
          disabled={disabled}
          ariaLabel={ariaLabel}
        />
      </span>
      {open && !disabled && !menuAria.usedFallback && (
        <Popover
          open
          onDismiss={() => setOpen(false)}
          ignoreSelector="[data-composer-model-trigger]"
          role="menu"
          aria-label={menuAria.message}
          data-composer-model-menu
          className="absolute bottom-full right-0 z-40 mb-fg-1 max-h-80 min-w-64 overflow-y-auto rounded-fg-md border border-rule bg-paper-raised p-fg-1 shadow-fg-popover"
        >
          <ul className="flex flex-col gap-fg-0-5">
            {profiles.map((profile) => (
              <ProfileRow
                key={profile.id}
                profile={profile}
                selected={selected?.id === profile.id}
                mixedLabel={mixedLabel}
                onSelect={() => {
                  onSelectProfile(profile.id);
                  setOpen(false);
                }}
              />
            ))}
          </ul>
        </Popover>
      )}
    </div>
  );
}
