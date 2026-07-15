export const projects = {
  addDialog: {
    accessibility: {
      folderPath: "Project folder path",
    },
    actions: {
      add: "Add project",
      adding: "Adding project…",
      pickFolder: "Pick folder",
    },
    description: "Choose a project folder. Its files will not be changed.",
    errors: {
      addFailed: "This project could not be added. Try again.",
      alreadyAdded: "This project is already added. Choose it from the project list.",
      folderUnavailable:
        "That folder could not be opened. Check the path and folder permissions, then try again.",
      notGitProject: "Choose a folder that contains a Git repository.",
      pathRequired: "Enter the full path to a project folder.",
    },
    fields: {
      folder: "Project folder",
    },
    placeholders: {
      folderPath: "Enter the full folder path",
    },
    title: "Add a project",
  },
  actions: {
    add: "Add project…",
    checkProjectStatus: "Check project status",
    clearHistory: "Clear project history",
    openPullRequest: "Open pull request",
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
    refreshProjectForPullRequest: "Refresh project data, then try again.",
    setUpProjectFirst: "Set up the project, then try again.",
    waitForProjectStatus: "Wait for the project status to load, then try again.",
  },
  folderBrowser: {
    accessibility: {
      filterFolders: "Filter folders in this level",
      folderOptionGitRepository: "{{folder}}, Git repository",
      folderOptionHidden: "{{folder}}, hidden folder",
      folderOptionProject: "{{folder}}, project",
      folderOptionRegistered: "{{folder}}, already added",
      folders: "Folders",
      showHiddenFolders: "Show hidden folders",
    },
    badges: {
      alreadyAdded: "Already added",
      gitRepository: "Git repository",
      hidden: "Hidden",
      project: "Project",
    },
    empty: {
      noMatches: "No folders match.",
      noSubfolders: "No subfolders here.",
    },
    errors: {
      readFailed: "This folder could not be opened.",
      readFailedHint: "Check the path or choose another folder.",
    },
    labels: {
      filterFolders: "Filter folders…",
      hidden: "Hidden",
      roots: "This computer",
    },
    states: {
      loading: "Reading folders…",
      truncated: "Showing the first {{limit, number}} folders.",
    },
  },
  placesRail: {
    labels: {
      home: "Home",
      places: "Places",
    },
    sections: {
      drives: "Drives",
      projects: "Projects",
      recent: "Recent",
    },
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
