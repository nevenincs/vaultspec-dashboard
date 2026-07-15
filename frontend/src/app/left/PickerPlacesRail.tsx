// Project picker shortcuts for home, drives, registered projects, and recent
// locations. The same rows become horizontal chips on compact screens.

import { useMemo } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import type {
  FsListResponse,
  RecentScope,
  WorkspaceRoot,
} from "../../stores/server/engine";
import {
  useFsList,
  useSession,
  useWorkspaceRoots,
  workspaceRootName,
} from "../../stores/server/queries";
import { SectionLabel } from "../kit";

export const PLACES_RAIL_MESSAGES = {
  drives: { key: "projects:placesRail.sections.drives" },
  home: { key: "projects:placesRail.labels.home" },
  places: { key: "projects:placesRail.labels.places" },
  projects: { key: "projects:placesRail.sections.projects" },
  recent: { key: "projects:placesRail.sections.recent" },
} as const satisfies Record<string, MessageDescriptor>;

export type PickerPlaceKind = "home" | "drive" | "project" | "recent";

export interface PickerPlaceRowView {
  key: string;
  /** A localized label for Home; a filesystem/registry name otherwise. */
  label: MessageDescriptor | string;
  path: string;
  kind: PickerPlaceKind;
}

export interface PickerPlaceSectionView {
  key: "top" | "drives" | "projects" | "recent";
  /** The section heading; the unlabeled top section (Home) carries null. */
  label: MessageDescriptor | null;
  rows: PickerPlaceRowView[];
}

const MAX_RECENT_PLACES = 3;

export function pickerParentPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  if (/^\/\/[^/]+\/[^/]+$/.test(normalized)) return path;
  const separator = normalized.lastIndexOf("/");
  if (separator === 0) return "/";
  if (separator === 2 && /^[A-Za-z]:/.test(normalized)) {
    return `${normalized.slice(0, 2)}/`;
  }
  return separator > 0 ? normalized.slice(0, separator) : path;
}

/** Pure resolver: compose the rail's sections from the served places block,
 *  the roots entries (drives), the workspace registry, and the session
 *  recents (deduplicated worktree paths, newest first, capped). */
export function derivePickerPlaces(inputs: {
  roots: FsListResponse | undefined;
  workspaces: WorkspaceRoot[];
  recentScopes: RecentScope[];
}): PickerPlaceSectionView[] {
  const { roots, workspaces, recentScopes } = inputs;
  const sections: PickerPlaceSectionView[] = [];

  const top: PickerPlaceRowView[] = (roots?.places ?? []).map((place) => ({
    key: `place:${place.path}`,
    // The home shortcut always uses the localized label.
    label: PLACES_RAIL_MESSAGES.home,
    path: place.path,
    kind: "home",
  }));
  if (top.length > 0) sections.push({ key: "top", label: null, rows: top });

  const drives: PickerPlaceRowView[] = (roots?.entries ?? []).map((entry) => ({
    key: `drive:${entry.path}`,
    label: entry.name,
    path: entry.path,
    kind: "drive",
  }));
  if (drives.length > 0) {
    sections.push({ key: "drives", label: PLACES_RAIL_MESSAGES.drives, rows: drives });
  }

  // Use the shared project name so common worktree layouts do not render every
  // project with the same branch label.
  const projects: PickerPlaceRowView[] = workspaces.map((root) => ({
    key: `project:${root.id}`,
    label: workspaceRootName(root),
    path: pickerParentPath(root.path),
    kind: "project",
  }));
  if (projects.length > 0) {
    sections.push({
      key: "projects",
      label: PLACES_RAIL_MESSAGES.projects,
      rows: projects,
    });
  }

  const seen = new Set<string>();
  const recent: PickerPlaceRowView[] = [];
  for (const entry of recentScopes) {
    const path = entry.scope;
    if (typeof path !== "string" || path.length === 0 || seen.has(path)) continue;
    seen.add(path);
    recent.push({
      key: `recent:${path}`,
      label: path.split(/[\\/]/).filter(Boolean).pop() ?? path,
      path,
      kind: "recent",
    });
    if (recent.length >= MAX_RECENT_PLACES) break;
  }
  if (recent.length > 0) {
    sections.push({ key: "recent", label: PLACES_RAIL_MESSAGES.recent, rows: recent });
  }

  return sections;
}

export interface PickerPlacesRailProps {
  /** The browsed directory, for the active-place cue. */
  currentPath: string | null;
  /** Re-root the browser at a place. */
  onNavigate: (path: string) => void;
  disabled?: boolean;
}

export function PickerPlacesRail({
  currentPath,
  onNavigate,
  disabled = false,
}: PickerPlacesRailProps) {
  const resolveMessage = useLocalizedMessageResolver();
  const message = (descriptor: MessageDescriptor) => resolveMessage(descriptor).message;
  const rowLabel = (label: MessageDescriptor | string) =>
    typeof label === "string" ? label : message(label);

  // The roots listing shares its cached query with the browser.
  const rootsQuery = useFsList();
  const workspaces = useWorkspaceRoots();
  const session = useSession();
  const rawRecents = session.data?.recent_scopes;
  const sections = useMemo(
    () =>
      derivePickerPlaces({
        roots: rootsQuery.data,
        workspaces,
        recentScopes: rawRecents ?? [],
      }),
    [rootsQuery.data, workspaces, rawRecents],
  );

  if (sections.length === 0) return null;

  return (
    <nav
      aria-label={message(PLACES_RAIL_MESSAGES.places)}
      className="flex shrink-0 gap-fg-1 border-rule bg-paper-sunken max-sm:items-center max-sm:overflow-x-auto max-sm:border-b max-sm:px-fg-3 max-sm:py-fg-1-5 sm:w-44 sm:flex-col sm:overflow-y-auto sm:border-r sm:p-fg-2"
      data-picker-places-rail
    >
      {sections.map((section) => (
        <div
          key={section.key}
          className="flex gap-fg-0-5 max-sm:flex-row max-sm:items-center max-sm:gap-fg-1 sm:flex-col"
        >
          {section.label !== null && (
            <SectionLabel className="max-sm:hidden px-fg-2 pt-fg-2 pb-fg-0-5">
              {message(section.label)}
            </SectionLabel>
          )}
          {section.rows.map((row) => {
            const isActive = currentPath !== null && currentPath === row.path;
            const ariaCurrent = isActive ? "true" : undefined;
            return (
              <button
                key={row.key}
                type="button"
                disabled={disabled}
                onClick={() => onNavigate(row.path)}
                aria-current={ariaCurrent}
                title={row.path}
                className={`flex shrink-0 items-center gap-fg-2 text-left text-label transition-colors duration-ui-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus max-sm:rounded-fg-pill max-sm:px-fg-3 max-sm:py-fg-1 sm:w-full sm:rounded-fg-xs sm:px-fg-2 sm:py-fg-1 ${
                  isActive
                    ? "bg-accent-subtle text-ink"
                    : "text-ink-muted hover:bg-paper hover:text-ink max-sm:bg-paper"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{rowLabel(row.label)}</span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
