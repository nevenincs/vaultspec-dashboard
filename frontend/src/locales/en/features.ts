export const features = {
  confirmations: {
    archive: {
      body: "This removes the feature and its documents from active work.",
      title: "Archive {{feature}}?",
    },
    repair: {
      body: "This applies fixes across this feature's documents. Review the changes when it finishes.",
      title: "Repair {{feature}}?",
    },
  },
  destructiveActions: {
    archive: "Archive feature",
  },
  disabledReasons: {
    selectFeature: "Select a feature first.",
  },
  guardedActions: {
    repair: "Repair feature",
  },
} as const;
