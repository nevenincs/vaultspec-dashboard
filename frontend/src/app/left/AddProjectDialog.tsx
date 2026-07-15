// Localized project folder picker. Browsing and selection stay local to one
// open dialog. Store hooks own reads and registration.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import type { AddProjectIssue } from "../../stores/addProjectIssue";
import { useAddWorkspace, useFsList } from "../../stores/server/queries";
import {
  resetAddProjectChrome,
  setAddProjectIssue,
  setAddProjectPath,
  useAddProjectChrome,
} from "../../stores/view/addProjectChrome";
import { Dialog } from "../chrome/Dialog";
import { deriveFolderBrowserView, FolderBrowser } from "./FolderBrowser";
import { PickerPlacesRail } from "./PickerPlacesRail";
import { Button } from "../kit";

export const ADD_PROJECT_MESSAGES = {
  add: { key: "projects:addDialog.actions.add" },
  pickFolder: { key: "projects:addDialog.actions.pickFolder" },
  adding: { key: "projects:addDialog.actions.adding" },
  description: { key: "projects:addDialog.description" },
  folderPath: { key: "projects:addDialog.accessibility.folderPath" },
  placeholder: { key: "projects:addDialog.placeholders.folderPath" },
  title: { key: "projects:addDialog.title" },
  cancel: { key: "common:actions.cancel" },
} as const satisfies Record<string, MessageDescriptor>;

/** The footer primary reads a static label: "Pick folder" while idle, the
 *  pending message while a registration is in flight. The chosen folder's name
 *  does not interpolate into the label because the selection is shown in the
 *  browser and path field, not the button. */
export function addProjectConfirmMessage(submitting: boolean): MessageDescriptor {
  return submitting ? ADD_PROJECT_MESSAGES.adding : ADD_PROJECT_MESSAGES.pickFolder;
}

export const ADD_PROJECT_ISSUE_MESSAGES = {
  addFailed: { key: "projects:addDialog.errors.addFailed" },
  alreadyAdded: { key: "projects:addDialog.errors.alreadyAdded" },
  folderUnavailable: { key: "projects:addDialog.errors.folderUnavailable" },
  notGitProject: { key: "projects:addDialog.errors.notGitProject" },
  pathRequired: { key: "projects:addDialog.errors.pathRequired" },
} as const satisfies Record<AddProjectIssue, MessageDescriptor>;

/** How long a typed path settles before the browser follows it. */
const PATH_PARSE_DEBOUNCE_MS = 300;

/** Split a typed absolute path into the deepest complete directory level and
 *  the unfinished last segment used to narrow the current level. A trailing separator
 *  means the whole path is the level. Relative fragments parse to null. */
export function parseTypedPath(raw: string): { level: string; filter: string } | null {
  const value = raw.trim().replace(/\\/g, "/");
  if (value.length === 0) return null;
  const isAbsolute = value.startsWith("/") || /^[A-Za-z]:\//.test(value);
  if (!isAbsolute) return null;
  const lastSlash = value.lastIndexOf("/");
  if (lastSlash === -1) return null;
  const level = value.slice(0, lastSlash + 1);
  const filter = value.slice(lastSlash + 1);
  // Preserve root separators and trim separators from deeper levels.
  const normalized =
    /^[A-Za-z]:\/$/.test(level) || level === "/" ? level : level.replace(/\/+$/, "");
  return { level: normalized, filter };
}

export function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function parentDirectory(path: string): string | null {
  const normalized = path.replace(/\\/g, "/");
  if (
    normalized === "/" ||
    /^[A-Za-z]:\/$/.test(normalized) ||
    /^\/\/[^/]+\/[^/]+\/?$/.test(normalized)
  ) {
    return null;
  }
  const trimmed = normalized.replace(/\/+$/, "");
  const separator = trimmed.lastIndexOf("/");
  if (separator < 0) return null;
  if (separator === 0) return "/";
  if (separator === 2 && /^[A-Za-z]:/.test(trimmed)) {
    return `${trimmed.slice(0, 2)}/`;
  }
  return trimmed.slice(0, separator);
}

export interface TypedPathResolution {
  level: string;
  filter: string;
  enterRequested: boolean;
}

export function retreatTypedPathResolution(
  resolution: TypedPathResolution,
): TypedPathResolution | null {
  const parent = parentDirectory(resolution.level);
  return parent === null
    ? null
    : {
        level: parent,
        filter: basename(resolution.level),
        enterRequested: resolution.enterRequested,
      };
}

/** Mount picker reads only while the dialog is open. */
export function AddProjectDialog() {
  const { open } = useAddProjectChrome();
  return open ? <AddProjectDialogBody /> : null;
}

function AddProjectDialogBody() {
  const resolveMessage = useLocalizedMessageResolver();
  const message = (descriptor: MessageDescriptor) => resolveMessage(descriptor).message;
  const { open, path, issue } = useAddProjectChrome();
  const { add } = useAddWorkspace();

  // Widget-intrinsic picker state (not a corpus filter or shared dashboard
  // intent): the browsed level, the selected row, the level filter, and the
  // hidden toggle. Reset per open by the gate's unmount; reset explicitly on a
  // successful registration.
  const [browsePath, setBrowsePath] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [operatorDraft, setOperatorDraft] = useState(false);
  const [typedResolution, setTypedResolution] = useState<TypedPathResolution | null>(
    null,
  );

  const level = useFsList({
    path: browsePath ?? undefined,
    q: query.trim().length > 0 ? query.trim() : undefined,
    hidden: showHidden || undefined,
  });
  const view = useMemo(
    () =>
      deriveFolderBrowserView({
        data: level.data,
        loading: level.isPending,
        errored: level.isError,
        filtered: query.trim().length > 0,
      }),
    [level.data, level.isPending, level.isError, query],
  );

  // Browser navigation and selection update the shared path draft.
  // `programmaticDraft` distinguishes those writes from operator typing so
  // they never bounce back through the typed-path parser.
  const programmaticDraft = useRef(false);
  const writeDraft = (next: string) => {
    programmaticDraft.current = true;
    setAddProjectPath(next);
  };

  // Every landed navigation, including list gestures, breadcrumbs, shortcuts,
  // and completed typed paths, arms this intent. The browser
  // consumes it when the new level renders, refocusing its first row so
  // keyboard focus survives the activated control unmounting.
  const listFocusIntent = useRef(false);
  const navigate = (next: string | null) => {
    if (submitting) return;
    listFocusIntent.current = true;
    setSelected(null);
    setQuery("");
    setTypedResolution(null);
    setOperatorDraft(false);
    setBrowsePath(next);
    writeDraft(next ?? "");
  };
  const select = (next: string | null) => {
    if (submitting) return;
    setSelected(next);
    setOperatorDraft(false);
    setTypedResolution(null);
    writeDraft(next ?? view.currentPath ?? "");
  };

  // A typed path follows its deepest available parent and narrows by the next
  // segment. Enter applies the path immediately but never registers it.
  const applyTypedPath = useCallback((raw: string, enterRequested = false) => {
    const parsed = parseTypedPath(raw);
    setOperatorDraft(true);
    setSelected(null);
    if (parsed === null) {
      setTypedResolution(null);
      setBrowsePath(null);
      setQuery("");
      return;
    }
    setTypedResolution({ ...parsed, enterRequested });
    setBrowsePath(parsed.level);
    setQuery(parsed.filter);
  }, []);
  useEffect(() => {
    if (programmaticDraft.current) {
      programmaticDraft.current = false;
      return;
    }
    if (!open || submitting) return;
    const timer = setTimeout(() => applyTypedPath(path), PATH_PARSE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [path, open, submitting, applyTypedPath]);

  useEffect(() => {
    if (submitting || typedResolution === null || level.isPlaceholderData) return;
    if (level.isError) {
      const next = retreatTypedPathResolution(typedResolution);
      if (next === null) {
        setTypedResolution(null);
        return;
      }
      setTypedResolution(next);
      setBrowsePath(next.level);
      setQuery(next.filter);
      return;
    }
    if (!level.isSuccess || level.data?.path !== typedResolution.level) return;
    if (typedResolution.enterRequested) {
      if (typedResolution.filter.length === 0) {
        navigate(typedResolution.level);
        return;
      }
      // Case-folded exact name match: filesystem names are data, so a plain
      // case-insensitive comparison (not locale collation) picks the segment.
      const wanted = typedResolution.filter.toLowerCase();
      const exact = level.data.entries.find(
        (entry) => !entry.is_registered && entry.name.toLowerCase() === wanted,
      );
      if (exact) {
        navigate(exact.path);
        return;
      }
    }
    setTypedResolution(null);
  }, [
    level.data,
    level.isError,
    level.isPlaceholderData,
    level.isSuccess,
    submitting,
    typedResolution,
  ]);

  const levelIsAuthoritative =
    view.state === "ready" &&
    !level.isPlaceholderData &&
    level.data?.is_registered === false;
  const target = level.isPlaceholderData
    ? null
    : (selected ?? (!operatorDraft && levelIsAuthoritative ? view.currentPath : null));

  const resetSelectionToCurrent = () => {
    if (submitting) return;
    setSelected(null);
    setOperatorDraft(false);
    setTypedResolution(null);
    writeDraft(view.currentPath ?? "");
  };

  const close = () => {
    if (!submitting) resetAddProjectChrome();
  };

  const submit = () => {
    if (submitting) return;
    if (target === null || target.length === 0) {
      setAddProjectIssue("pathRequired");
      return;
    }
    setAddProjectIssue(null);
    setSubmitting(true);
    void add(target).then((outcome) => {
      setSubmitting(false);
      if (outcome.ok) {
        setBrowsePath(null);
        setSelected(null);
        setQuery("");
        resetAddProjectChrome();
      } else {
        setAddProjectIssue(outcome.issue);
      }
    });
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={!submitting}
      title={message(ADD_PROJECT_MESSAGES.title)}
      description={message(ADD_PROJECT_MESSAGES.description)}
      size="medium"
      footer={
        <div className="flex flex-col gap-fg-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            {issue !== null && (
              <p role="alert" className="break-words text-label text-state-broken">
                {message(ADD_PROJECT_ISSUE_MESSAGES[issue])}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center justify-end gap-fg-2">
            <Button variant="secondary" onClick={close} disabled={submitting}>
              {message(ADD_PROJECT_MESSAGES.cancel)}
            </Button>
            <Button
              variant="primary"
              onClick={submit}
              disabled={submitting || target === null || target.length === 0}
            >
              {message(addProjectConfirmMessage(submitting))}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col">
        <div className="px-fg-4 pt-fg-3 pb-fg-2">
          <input
            type="text"
            value={path}
            disabled={submitting}
            onChange={(event) => {
              if (submitting) return;
              setOperatorDraft(true);
              setAddProjectPath(event.target.value);
            }}
            onKeyDown={(event) => {
              // Registration remains an explicit footer action.
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                if (submitting) return;
                applyTypedPath(path, true);
              }
            }}
            placeholder={message(ADD_PROJECT_MESSAGES.placeholder)}
            aria-label={message(ADD_PROJECT_MESSAGES.folderPath)}
            spellCheck={false}
            className="w-full rounded-fg-xs border border-rule bg-paper px-fg-2 py-fg-1 font-mono text-body text-ink outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          />
        </div>
        <div className="flex h-[22rem] min-h-0 border-t border-rule max-sm:flex-col">
          <PickerPlacesRail
            currentPath={view.currentPath}
            onNavigate={navigate}
            disabled={submitting}
          />
          <FolderBrowser
            view={view}
            inert={level.isPlaceholderData || submitting}
            selectedPath={selected}
            onSelect={select}
            onNavigate={navigate}
            focusIntent={listFocusIntent}
            query={query}
            onQueryChange={(next) => {
              if (submitting) return;
              resetSelectionToCurrent();
              setQuery(next);
            }}
            showHidden={showHidden}
            onShowHiddenChange={(next) => {
              if (submitting) return;
              resetSelectionToCurrent();
              setShowHidden(next);
            }}
          />
        </div>
      </div>
    </Dialog>
  );
}
