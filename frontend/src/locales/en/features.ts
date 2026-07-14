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
  feedback: {
    archiveRejected: "The feature wasn't archived. Check it, then try again.",
    archiveSucceeded: "Feature archived.",
    archiveUnavailable: "Couldn't archive the feature. Try again.",
    repairRejected: "The feature wasn't repaired. Check it, then try again.",
    repairSucceeded: "Feature repaired.",
    repairUnavailable: "Couldn't repair the feature. Try again.",
  },
  guardedActions: {
    repair: "Repair feature",
  },
} as const;
