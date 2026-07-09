// The compact workspace switcher (mobile-enrichment ADR D1). On compact there is no
// left rail, so the desktop WorktreePicker's dropdown has no home; instead the Browse
// top-bar title becomes a tap-target that opens THIS bottom sheet. It re-PRESENTS the
// SAME `useWorktreePickerView` projection — the identical worktree/project rows and
// the existing `activateRow` / `swapProject` intents, each routed through the shared
// `guardUnsavedDiscard` so a switch never silently discards an editor draft. No new
// fetch, no new model: presentation only over the one projection (dashboard-layer-
// ownership; the desktop WorktreePicker is untouched).

import { Check, Folder, FolderPlus, GitBranch, type LucideIcon } from "lucide-react";

import { openAddProjectDialog } from "../../stores/view/addProjectChrome";
import { guardUnsavedDiscard } from "../../stores/view/unsavedEditGuard";
import { useWorktreePickerView } from "../../stores/view/worktreePickerChrome";
import { BottomSheet } from "../chrome/BottomSheet";

const EYEBROW_CLASS =
  "px-fg-1 pb-fg-1 pt-fg-2 text-caption uppercase tracking-wide text-ink-faint";
// ≥44px (2.75rem) touch target with a leading glyph column so every row's label
// starts on one column (design-system touch-target law; no hardcoded px).
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
        className={`min-w-0 flex-1 truncate ${active ? "font-medium text-accent-text" : ""}`}
      >
        {label}
      </span>
      {/* Current-workspace cue: an accent check (grayscale-safe — it is redundant
          with the accent name weight, per design-system). */}
      {active && <Check size={16} aria-hidden className="shrink-0 text-accent-text" />}
    </button>
  );
}

export interface WorkspaceSwitcherSheetProps {
  open: boolean;
  onDismiss: () => void;
}

/** The compact workspace switcher bottom sheet (ADR D1). */
export function WorkspaceSwitcherSheet({
  open,
  onDismiss,
}: WorkspaceSwitcherSheetProps) {
  const { pickerView, projectRows, activateRow, swapProject } = useWorktreePickerView();
  const rows = pickerView.rows;
  const showProjects = projectRows.length > 1;

  const chooseWorktree = (row: (typeof rows)[number]) => {
    onDismiss();
    guardUnsavedDiscard(() => activateRow(row));
  };
  const chooseProject = (project: (typeof projectRows)[number]) => {
    onDismiss();
    guardUnsavedDiscard(() => swapProject(project.id));
  };
  const addProject = () => {
    onDismiss();
    openAddProjectDialog();
  };

  return (
    <BottomSheet open={open} onDismiss={onDismiss} title="Switch workspace">
      <div className="flex flex-col gap-fg-1 pb-fg-2">
        <p className={EYEBROW_CLASS}>Worktrees</p>
        <ul className="flex flex-col gap-fg-0-5">
          {rows.map((row) => (
            <li key={row.worktree.id}>
              <SwitcherRow
                Icon={GitBranch}
                label={row.nameLabel}
                active={row.isActive}
                disabled={!row.selectable}
                ariaLabel={row.ariaLabel}
                title={row.title}
                onClick={() => chooseWorktree(row)}
              />
            </li>
          ))}
        </ul>

        {showProjects && (
          <>
            <p className={EYEBROW_CLASS}>Projects</p>
            <ul className="flex flex-col gap-fg-0-5">
              {projectRows.map((project) => (
                <li key={project.id}>
                  <SwitcherRow
                    Icon={Folder}
                    label={project.label}
                    active={project.isActive}
                    disabled={!project.selectable}
                    ariaLabel={project.ariaLabel}
                    title={project.title}
                    onClick={() => chooseProject(project)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}

        <SwitcherRow Icon={FolderPlus} label="Add a project" onClick={addProject} />
      </div>
    </BottomSheet>
  );
}
