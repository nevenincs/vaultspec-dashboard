export const projects = {
  actions: {
    add: "Add project…",
    checkProjectStatus: "Check project status",
    clearHistory: "Clear project history",
    prepareProjectTools: "Set up project tools",
    setUpProject: "Set up project",
    switch: "Switch project…",
    switchWorktree: "Switch to worktree",
    updateProject: "Update project",
    updateProjectTools: "Update project tools",
  },
  confirmations: {
    replaceSetup: {
      body: "This replaces existing setup files and may overwrite your changes. Save a backup before continuing.",
      title: "Replace project setup?",
    },
  },
  destructiveActions: {
    replaceSetup: "Replace project setup",
  },
  disabledReasons: {
    chooseWorktreeWithProjectFiles:
      "Choose another worktree that contains project files.",
    installRequiredProjectTools: "Install the required project tools, then try again.",
    noSetupChangesNeeded: "Return to the project to continue.",
    prepareFolderAsGitProject: "Prepare this folder as a Git project, then try again.",
    setUpProjectFirst: "Set up the project, then try again.",
    waitForProjectStatus: "Wait for the project status to load, then try again.",
  },
  provisioning: {
    description: "Set up this project to continue.",
    details: {
      installRequiredProjectTools:
        "Install the required project tools, then try again.",
      prepareFolderAsGitProject:
        "Prepare this folder as a Git project, then try again.",
    },
    progress: "Setting up project…",
    result: {
      completed: "Project setup completed",
      failed: "Project setup failed",
      indeterminate:
        "Setup may still be in progress. Check the project status before trying again.",
      itemCount_one: "{{count, number}} item",
      itemCount_other: "{{count, number}} items",
      status: {
        created: "Created",
        failed: "Failed",
        mixed: "Mixed results",
        removed: "Removed",
        restored: "Restored",
        skipped: "Skipped",
        updated: "Updated",
        upToDate: "Already up to date",
      },
    },
    startFailed: "Project setup could not start. Try again.",
    statusUnavailable: "Project status is unavailable",
    title: "Project setup required",
  },
  shortcutGroups: {
    projects: "Projects",
  },
} as const;
