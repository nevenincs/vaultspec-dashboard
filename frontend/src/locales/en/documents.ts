export const documents = {
  accessibility: {
    switchReadingAndEditingShortcut:
      "Switch between reading and editing ({{accelerator}})",
  },
  actions: {
    addToFeature: "Add to a feature…",
    clearFilter: "Clear the document filter",
    collapseTree: "Collapse document tree",
    copyLink: "Copy link",
    expandTree: "Expand document tree",
    findByName: "Find a document by name…",
    finishEditing: "Finish editing",
    focusFilter: "Focus the document filter",
    linkToSelectedDocument: "Link to selected document",
    resetFilters: "Reset filters",
    save: "Save document",
    showOrHideFilterOptions: "Show or hide filter options",
    showOrHideChanges: "Show or hide changes",
    switchReadingAndEditing: "Switch between reading and editing",
    switchView: "Switch between documents and files",
  },
  disabledReasons: {
    copyChangesBeforeReopening:
      "Copy your changes, then reopen the document before saving.",
    openForEditing: "Open a document for editing.",
    selectDifferentDocument: "Select a different document.",
    selectDocument: "Select a document first.",
    tryAfterSaving: "Try again after saving finishes.",
    updateBeforeSaving: "Update the document before saving.",
  },
  feedback: {
    alreadyLinked: "These documents are already linked.",
    linkConflict:
      "The document changed before it could be linked. Open it, then try again.",
    linkFailed: "Couldn't link the documents. Try again.",
    linkInProgress: "Linking documents…",
    linkSucceeded: "Documents linked.",
  },
  shortcutGroups: {
    editing: "Document editing",
  },
} as const;
