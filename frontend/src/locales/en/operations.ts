export const operations = {
  actions: {
    applySearchSettings: "Apply search settings",
    checkWorkspace: "Check workspace",
    disableSearch: "Disable search",
    enableSearch: "Enable search",
    refreshSearch: "Refresh search",
    showWorkspaceDetails: "Show workspace details",
  },
  feedback: {
    applySearchSettings: {
      failed: "Couldn't apply search settings. Try again.",
      running: "Applying search settings…",
      succeeded: "Search settings applied.",
      unavailable: "Search is unavailable. Enable search, then try again.",
    },
    checkWorkspace: {
      failed: "Couldn't check the workspace. Try again.",
      running: "Checking workspace…",
      succeeded: "Workspace check complete.",
    },
    disableSearch: {
      failed: "Couldn't disable search. Try again.",
      running: "Disabling search…",
      succeeded: "Search disabled.",
    },
    enableSearch: {
      failed: "Couldn't enable search. Try again.",
      running: "Enabling search…",
      succeeded: "Search enabled.",
      unavailable: "Search is still unavailable. Try again.",
    },
    refreshSearch: {
      failed: "Couldn't refresh search. Try again.",
      running: "Refreshing search…",
      succeeded: "Search refresh started.",
      unavailable: "Search is unavailable. Enable search, then try again.",
    },
    showWorkspaceDetails: {
      failed: "Couldn't load workspace details. Try again.",
      running: "Loading workspace details…",
      succeeded: "Workspace details loaded.",
    },
  },
} as const;
