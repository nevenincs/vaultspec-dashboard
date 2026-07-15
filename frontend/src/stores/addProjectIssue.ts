export const ADD_PROJECT_ISSUES = [
  "pathRequired",
  "folderUnavailable",
  "notGitProject",
  "alreadyAdded",
  "addFailed",
] as const;

export type AddProjectIssue = (typeof ADD_PROJECT_ISSUES)[number];

export function normalizeAddProjectIssue(value: unknown): AddProjectIssue | null {
  return typeof value === "string" &&
    (ADD_PROJECT_ISSUES as readonly string[]).includes(value)
    ? (value as AddProjectIssue)
    : null;
}
