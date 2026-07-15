import { Check, Folder, FolderPlus, GitBranch, type LucideIcon } from "lucide-react";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import {
  WORKSPACE_IDENTITY_MESSAGES,
  type WorkspaceIdentityText,
} from "../../stores/server/queries";

import { openAddProjectDialog } from "../../stores/view/addProjectChrome";
import { guardUnsavedDiscard } from "../../stores/view/unsavedEditGuard";
import { useWorktreePickerView } from "../../stores/view/worktreePickerChrome";
import { BottomSheet } from "../chrome/BottomSheet";

const EYEBROW_CLASS =
  "px-fg-1 pb-fg-1 pt-fg-2 text-caption tracking-wide text-ink-faint";
const ROW_CLASS =
  "flex min-h-[2.75rem] w-full items-center gap-fg-2 rounded-fg-sm px-fg-2 text-left text-body text-ink transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50";

interface SwitcherRowProps {
  Icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
  onClick: () => void;
}

function SwitcherRow({
  Icon,
  label,
  active = false,
  disabled = false,
  ariaLabel,
  title,
  onClick,
}: SwitcherRowProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-current={active ? "true" : undefined}
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      className={ROW_CLASS}
    >
      <Icon size={18} aria-hidden className="shrink-0 text-ink-faint" />
      <span
        className={`min-w-0 flex-1 select-text truncate ${active ? "font-medium text-accent-text" : ""}`}
      >
        {label}
      </span>
      {active && <Check size={16} aria-hidden className="shrink-0 text-accent-text" />}
    </button>
  );
}

export interface WorkspaceSwitcherSheetProps {
  open: boolean;
  onDismiss: () => void;
}

export function WorkspaceSwitcherSheet({
  open,
  onDismiss,
}: WorkspaceSwitcherSheetProps) {
  const resolveMessage = useLocalizedMessageResolver();
  const message = (descriptor: MessageDescriptor) => resolveMessage(descriptor).message;
  const identity = (value: WorkspaceIdentityText) =>
    typeof value === "string" ? value : message(value);
  const {
    pickerView,
    recentRows,
    projectRows,
    activateRow,
    activateRecent,
    swapProject,
  } = useWorktreePickerView();
  const rows = pickerView.rows;
  const showProjects = projectRows.length > 1;

  // Guard FIRST, dismiss only when the switch proceeds: a dirty draft keeps the sheet
  // open behind the discard confirm (parity with the desktop picker, which never
  // pre-closes. The popover collapses after a successful switch.
  const chooseWorktree = (row: (typeof rows)[number]) => {
    guardUnsavedDiscard(() => {
      onDismiss();
      activateRow(row);
    });
  };
  const chooseRecent = (recent: (typeof recentRows)[number]) => {
    guardUnsavedDiscard(() => {
      onDismiss();
      activateRecent(recent);
    });
  };
  const chooseProject = (project: (typeof projectRows)[number]) => {
    guardUnsavedDiscard(() => {
      onDismiss();
      swapProject(project.id);
    });
  };
  const addProject = () => {
    onDismiss();
    openAddProjectDialog();
  };

  return (
    <BottomSheet
      open={open}
      onDismiss={onDismiss}
      title={message(WORKSPACE_IDENTITY_MESSAGES.switchWorkspaceTitle)}
    >
      <div className="flex flex-col gap-fg-1 pb-fg-2">
        {recentRows.length > 0 && (
          <>
            <p className={EYEBROW_CLASS}>
              {message(WORKSPACE_IDENTITY_MESSAGES.recent)}
            </p>
            <ul className="flex flex-col gap-fg-0-5">
              {recentRows.map((recent) => (
                <li key={recent.key}>
                  <SwitcherRow
                    Icon={GitBranch}
                    label={identity(recent.label)}
                    active={recent.isActive}
                    disabled={!recent.selectable}
                    ariaLabel={message(recent.ariaLabel)}
                    title={message(recent.title)}
                    onClick={() => chooseRecent(recent)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
        <p className={EYEBROW_CLASS}>
          {message(WORKSPACE_IDENTITY_MESSAGES.worktrees)}
        </p>
        <ul className="flex flex-col gap-fg-0-5">
          {rows.map((row) => (
            <li key={row.worktreeId}>
              <SwitcherRow
                Icon={GitBranch}
                label={identity(row.nameLabel)}
                active={row.isActive}
                disabled={!row.selectable}
                ariaLabel={message(row.ariaLabel)}
                title={message(row.title)}
                onClick={() => chooseWorktree(row)}
              />
            </li>
          ))}
        </ul>

        {showProjects && (
          <>
            <p className={EYEBROW_CLASS}>
              {message(WORKSPACE_IDENTITY_MESSAGES.projects)}
            </p>
            <ul className="flex flex-col gap-fg-0-5">
              {projectRows.map((project) => (
                <li key={project.id}>
                  <SwitcherRow
                    Icon={Folder}
                    label={identity(project.label)}
                    active={project.isActive}
                    disabled={!project.selectable}
                    ariaLabel={message(project.ariaLabel)}
                    title={message(project.title)}
                    onClick={() => chooseProject(project)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}

        <SwitcherRow
          Icon={FolderPlus}
          label={message(WORKSPACE_IDENTITY_MESSAGES.addProject)}
          onClick={addProject}
        />
      </div>
    </BottomSheet>
  );
}
