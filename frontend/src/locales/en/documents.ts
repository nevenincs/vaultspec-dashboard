import { languageDisplay } from "./languageDisplay";

export const documents = {
  localizationWave: {
    authoring: {
      loadingPreview: "Loading the change preview",
      previewLoadFailed: "The change preview couldn’t be loaded.",
      previewUnavailable: "No change preview is available for this proposal.",
      noTextChange: "No textual change in this document.",
      truncatedPreview:
        "Preview truncated. Showing {{returned, number}} of {{total, number}} bytes. Open the document for the full body.",
    },
    accessibility: {
      documentActions: "Document actions",
      documentBodyEditor: "Document body editor",
      linkedDocuments: "Linked documents",
      planSummary: "Plan summary",
      suggestionsFor: "Suggestions for {{label}}",
    },
    actions: {
      fixConformance: "Repair conformance",
      fixFeatureConformance: "Repair “{{feature}}” conformance",
      removeRelated: "Remove {{document}}",
    },
    disabledReasons: {
      noFeatureForFix: "Add a feature tag before fixing conformance",
    },
    formatting: {
      boldPlaceholder: "bold text",
      codePlaceholder: "code",
      documentPlaceholder: "document",
      italicPlaceholder: "italic text",
      linkTextPlaceholder: "text",
      linkUrlPlaceholder: "url",
    },
    plan: {
      completion_one: "Plan completion, {{done, number}} of {{count, number}} step",
      completion_other: "Plan completion, {{done, number}} of {{count, number}} steps",
      counts: "{{waves}} · {{phases}} · {{steps}}",
      loadingSummary: "Loading plan summary…",
      phaseCount_one: "{{count, number}} phase",
      phaseCount_other: "{{count, number}} phases",
      stepCount_one: "{{count, number}} step",
      stepCount_other: "{{count, number}} steps",
      waveCount_one: "{{count, number}} wave",
      waveCount_other: "{{count, number}} waves",
    },
    related: {
      aria: "Link a related document",
      empty: "No matching documents",
      placeholder: "Link a document…",
    },
  },
  accessibility: {
    addDocumentToFeature: "Add a document to a feature",
    browserView: "Browser view",
    decisionAccepted: "Decision accepted",
    decisionDeprecated: "Decision retired",
    decisionProposed: "Decision proposed",
    decisionRejected: "Decision rejected",
    decisionSuperseded: "Decision replaced",
    planComplete: "Plan complete",
    planInProgress: "Plan in progress",
    planNotStarted: "Plan not started",
    treeBrowser: "Tree browser",
    switchReadingAndEditingShortcut:
      "Switch between reading and editing ({{accelerator}})",
    treeOptionsSortedByLatestActivity: "Tree options, sorted by latest activity",
    treeOptionsSortedByDocumentCount: "Tree options, sorted by document count",
    treeOptionsSortedByName: "Tree options, sorted by name",
    treeOptionsSortedByCreationDate: "Tree options, sorted by creation date",
    treeOptionsSortedByEditDate: "Tree options, sorted by edit date",
    treeOptionsSortedByLength: "Tree options, sorted by length",
    treeOptionsSortedByWorkspaceShare: "Tree options, sorted by workspace share",
  },
  actions: {
    addComment: "Add a comment",
    addToFeature: "Add to a feature…",
    browseDocuments: "Browse documents",
    browseFiles: "Browse files",
    closeAllDocuments: "Close all documents",
    closeDocument: "Close document",
    closeOtherDocuments: "Close other documents",
    clearFilter: "Clear the document filter",
    closeActiveTab: "Close the active document tab",
    collapseCategory: "Collapse category",
    collapseTree: "Collapse document tree",
    copyLink: "Copy link",
    expandTree: "Expand document tree",
    expandCategory: "Expand category",
    findByName: "Find a document by name…",
    finishEditing: "Finish editing",
    focusFilter: "Focus the document filter",
    keepDocumentOpen: "Keep document open",
    keepTabOpen: "Keep tab open",
    linkToSelectedDocument: "Link to selected document",
    nextChange: "Move to next change",
    nextTab: "Move to next document tab",
    openComments: "Open comments",
    previousChange: "Move to previous change",
    previousTab: "Move to previous document tab",
    resetFilters: "Reset filters",
    resetSorting: "Reset sorting",
    reloadDocument: "Reload document",
    save: "Save document",
    sortByLatestActivity: "Sort by latest activity",
    sortByDocumentCount: "Sort by document count",
    sortByName: "Sort by name",
    sortByCreationDate: "Sort by creation date",
    sortByEditDate: "Sort by edit date",
    sortByLength: "Sort by length",
    sortByWorkspaceShare: "Sort by workspace share",
    showOrHideFilterOptions: "Show or hide filter options",
    showOrHideChanges: "Show or hide changes",
    filterByDocumentType: "Filter by this document type",
    switchReadingAndEditing: "Switch between reading and editing",
    switchView: "Switch between documents and files",
  },
  documentSearch: {
    accessibility: {
      dialog: "Find a document",
      results: "Documents",
    },
    counts: {
      documents_one: "{{count, number}} document",
      documents_other: "{{count, number}} documents",
    },
    placeholders: {
      query: "Search documents by name…",
    },
    states: {
      idle: "Search for a document by name.",
      noMatches: "No documents match “{{query}}”.",
      searching: "Searching documents…",
      unavailable: "Documents are temporarily unavailable. Try again.",
    },
  },
  guardedActions: {
    moveCommentToThisSection: "Move comment to this section",
    reviewStationApproveProposal: "Approve proposal",
    reviewStationApplyChanges: "Apply changes",
    reviewStationPrepareRollback: "Prepare rollback",
  },
  destructiveActions: {
    deleteComment: "Delete comment",
    reviewStationRejectProposal: "Reject proposal",
  },
  browserModes: {
    documents: "Documents",
    files: "Files",
  },
  categories: {
    code: "Code",
  },
  codeTree: {
    accessibility: {
      browser: "Project files",
      linkedToMap: "Shown in project map",
    },
    errors: {
      childUnavailable: "This folder could not be loaded. Try again.",
      unavailable: "Project files could not be loaded. Try again.",
    },
    states: {
      childLoading: "Loading folder…",
      degraded: "Project files are unavailable. Browse documents instead.",
      empty: "No project files found.",
      loading: "Loading project files…",
      truncated: "Loaded {{shown, number}} of {{total, number}} files and folders.",
      truncatedUnknown: "More files and folders are available here.",
    },
  },
  confirmations: {
    discardUnsavedChanges: {
      title: "Discard unsaved changes?",
      body: "Your unsaved document changes will be lost. This cannot be undone.",
    },
  },
  createDialog: {
    accessibility: {
      addLinkedDocument: "Add a linked document",
      backToFeature: "Back to feature",
      documentType: "Document type",
      feature: "Feature",
      linkedDocuments: "Linked documents",
      pipelineCoverage: "Pipeline progress",
      removeLinkedDocument: "Remove {{document}}",
      title: "Title",
    },
    actions: {
      back: "Back",
      continue: "Continue",
      create: "Create",
      creating: "Creating document…",
    },
    descriptions: {
      documentStage:
        "Choose an available document type. Links to recent related documents are added for you.",
      featureStage:
        "Choose the feature this work belongs to, or enter a new feature tag. New documents are added to the feature's workflow.",
    },
    documentTypes: {
      adr: "Decision record",
      audit: "Audit",
      document: "Document",
      exec: "Step record",
      plan: "Plan",
      reference: "Reference",
      research: "Research",
    },
    emptyStates: {
      createFeatureTag: "Enter a new feature tag",
      noMatchingDocuments: "No matching documents",
    },
    errors: {
      createFailed: "The document could not be created. Refresh the app and try again.",
      inFlight: "This document is still being created. Wait a moment, then try again.",
      pathCollision:
        "A document of this type already exists for this feature today. Choose another type or try again tomorrow.",
      projectChanged:
        "The project changed before the document was created. Review your choices and try again.",
      scopeChanged: "The project location changed. Reopen the project, then try again.",
    },
    hints: {
      adr: "Record a decision",
      audit: "Review completed work or start a workflow",
      notAvailable: "This document type isn't available yet.",
      plan: "Plan the work",
      reference: "Connect the work to existing code",
      requiresDecision: "Add a decision record first.",
      requiresResearchOrReference: "Add a research or reference document first.",
      research: "Explore the problem",
    },
    labels: {
      documentType: "Document type",
      feature: "Feature",
      inThisFeature: "In this feature",
      linkedDocuments: "Linked documents",
      title: "Title",
    },
    placeholders: {
      addLinkedDocument: "Add a linked document",
      documentTitle: "Enter a document title",
      featureTag: "Enter a feature tag",
    },
    stages: {
      document: "Step 2 of 2: add a document",
      feature: "Step 1 of 2: add to a feature",
    },
    states: {
      checkingCoverage: "Checking feature progress…",
      chooseFeatureForCoverage: "Choose or enter a feature to see its progress.",
      coverageUnavailable:
        "Project progress is unavailable. Refresh project data, then try again.",
      emptyFeature:
        "No documents yet. Add a research or reference document to start this feature.",
      nextStep: "Next step",
      notYet: "Not yet",
      present: "Present",
      selected: "Selected",
    },
    titles: {
      document: "Add a document",
      feature: "Add to a feature",
    },
    validation: {
      chooseAvailableDocumentType: "Choose an available document type.",
      chooseDocumentType: "Choose a document type.",
      chooseFeature: "Choose or enter a feature.",
      completeRequiredFields: "Enter a feature and title.",
      requiresDecision: "Add a decision record first.",
      requiresResearchOrReference: "Add a research or reference document first.",
    },
  },
  documentTypes: {
    research: "Research",
    adr: "Decisions",
    plan: "Plans",
    exec: "Steps",
    audit: "Audits",
    reference: "References",
  },
  editor: {
    accessibility: {
      formattingToolbar: "Formatting",
    },
    actions: {
      bold: "Apply bold",
      italic: "Apply italic",
      inlineCode: "Apply inline code",
      heading: "Add heading",
      bulletedList: "Add bulleted list",
      numberedList: "Add numbered list",
      quote: "Add quote",
      link: "Add link",
      linkToDocument: "Add document link",
    },
    advisories: {
      label: "Conformance advisories",
      fixable: "Fixable",
    },
    statuses: {
      saved: "Saved",
      unsaved: "Unsaved changes",
      saving: "Saving…",
      saveFailed: "Save failed",
      conflict: "Conflict: the file changed on disk",
    },
  },
  reviewStation: {
    accessibility: {
      loadingQueue: "Loading approvals",
    },
    actions: {
      hideChanges: "Hide changes",
      requestChanges: "Request changes",
      showChanges: "Show changes",
      submitForReview: "Submit for review",
    },
    requestChanges: {
      body: "Send this proposal back to the assistant with the changes you want made.",
      commentLabel: "Requested changes",
      commentRequired: "Add a note describing the requested changes.",
      placeholder: "Describe the changes to make…",
    },
    confirmations: {
      approve: {
        title: "Approve this proposal?",
        body: "Approve this proposal so its document changes can be applied.",
      },
      apply: {
        title: "Apply these changes?",
        body: "Apply the approved changes to the affected documents.",
      },
      reject: {
        title: "Reject this proposal?",
        body: "Reject this proposal without applying its document changes.",
      },
      rollback: {
        title: "Prepare a rollback?",
        body: "Prepare a new proposal that reverses the applied document changes.",
      },
    },
    statuses: {
      applied: "Applied",
      applying: "Applying",
      approved: "Approved",
      cancelled: "Cancelled",
      compensationRequired: "Needs repair",
      conflicted: "Conflicted",
      draft: "Draft",
      failed: "Failed",
      generating: "Generating",
      needsReview: "Needs review",
      partiallyApplied: "Partially applied",
      proposed: "Proposed",
      rejected: "Rejected",
      rollbackProposed: "Rollback proposed",
      superseded: "Superseded",
      unknown: "Status unavailable",
    },
    policy: {
      assistedHumanApproval: "Assisted, reviewer approval",
      assistedSystemApproval: "Assisted, automatic approval",
      autonomousHumanApproval: "Autonomous, reviewer approval",
      autonomousSystemApproval: "Autonomous, automatic approval",
      manualHumanApproval: "Manual, reviewer approval",
      manualSystemApproval: "Manual, automatic approval",
      unavailable: "Approval policy unavailable",
    },
    authorKinds: {
      agent: "Assistant",
      human: "Reviewer",
      system: "System",
      toolExecutor: "Automation",
      unknown: "Unknown author",
    },
    validation: {
      invalid: "Validation failed",
      stale: "Validation expired",
      unavailable: "Validation unavailable",
      valid: "Validated",
      validWithWarnings: "Validated with warnings",
    },
    stale: {
      policyChanged: "Review policy changed",
      reviewChanged: "Review changed",
    },
    counts: {
      acknowledgements_one: "{{count, number}} acknowledgement",
      acknowledgements_other: "{{count, number}} acknowledgements",
      changes_one: "{{count, number}} change",
      changes_other: "{{count, number}} changes",
    },
    disabledReasons: {
      actionInProgress: "Wait for the current action to finish.",
      actionUnavailable: "Refresh the proposal and try again.",
      rollbackUnavailable: "Refresh the proposal and check rollback availability.",
    },
    feedback: {
      actionAccepted: "Request accepted.",
      actionNotAllowed: "Review the proposal and choose an available action.",
      rollbackUnavailable: "Refresh the proposal and check rollback availability.",
      reviewChanged: "Review the latest proposal, then try again.",
      reviewerUnavailable:
        "This action could not be authorized. Refresh, then try again.",
    },
    errors: {
      actionFailed: "The action could not be completed. Try again.",
      conflict:
        "The target document changed after review. Resolve the conflict before applying.",
      queueUnavailable: "Approvals are unavailable. Refresh the app and try again.",
    },
    states: {
      appliedAutomatically: "Applied automatically",
      empty: "No proposals are waiting for review.",
      informationMayBeOutOfDate:
        "Approval information may be out of date. Refresh to get the latest information.",
      loading: "Loading approvals…",
      moreAppliedChanges: "More automatically applied changes are available.",
      moreProposals: "More proposals are available. Narrow the queue to see them.",
      untitledProposal: "Untitled proposal",
    },
    sections: {
      appliedAutomatically: "Applied automatically",
    },
    labels: {
      actionUnavailable: "Action unavailable",
    },
  },
  viewer: {
    languages: languageDisplay,
    accessibility: {
      documentMode: "Document mode",
      documentProperties: "Document properties",
      featureTag: "Feature tag",
    },
    modes: {
      edit: "Edit",
      view: "View",
    },
    codeViewer: {
      accessibility: {
        contents: "Code contents",
      },
      errors: {
        loadFailed: "The file could not be loaded. Close it, then open it again.",
        temporarilyUnavailable:
          "The file is temporarily unavailable. Try again in a moment.",
      },
      footer: {
        summary_one: "{{language}}, {{encoding}}, {{count, number}} line, read-only",
        summary_other: "{{language}}, {{encoding}}, {{count, number}} lines, read-only",
      },
      labels: {
        code: "Code",
        readOnly: "Read-only",
      },
      states: {
        empty: "This file is empty.",
        loading: "Loading code…",
        missing: "This file is not available here. Choose another file.",
      },
    },
    reader: {
      accessibility: {
        document: "Document",
      },
      errors: {
        loadFailed: "The document could not be loaded. Close it, then open it again.",
        temporarilyUnavailable:
          "The document is temporarily unavailable. Try again in a moment.",
      },
      labels: {
        created: "Created",
        document: "Document",
        readOnly: "Read-only",
        relatedDocuments: "Related documents",
        tags: "Tags",
        updated: "Updated",
      },
      metadata: {
        readTime_one: "{{count, number}} min read",
        readTime_other: "{{count, number}} min read",
        readTimeStatus_one: "{{count, number}} min read · {{status}}",
        readTimeStatus_other: "{{count, number}} min read · {{status}}",
        createdReadTime_one: "Created {{created}} · {{count, number}} min read",
        createdReadTime_other: "Created {{created}} · {{count, number}} min read",
        createdReadTimeStatus_one:
          "Created {{created}} · {{count, number}} min read · {{status}}",
        createdReadTimeStatus_other:
          "Created {{created}} · {{count, number}} min read · {{status}}",
        updatedReadTime_one: "Updated {{updated}} · {{count, number}} min read",
        updatedReadTime_other: "Updated {{updated}} · {{count, number}} min read",
        updatedReadTimeStatus_one:
          "Updated {{updated}} · {{count, number}} min read · {{status}}",
        updatedReadTimeStatus_other:
          "Updated {{updated}} · {{count, number}} min read · {{status}}",
        createdUpdatedReadTime_one:
          "Created {{created}} · updated {{updated}} · {{count, number}} min read",
        createdUpdatedReadTime_other:
          "Created {{created}} · updated {{updated}} · {{count, number}} min read",
        createdUpdatedReadTimeStatus_one:
          "Created {{created}} · updated {{updated}} · {{count, number}} min read · {{status}}",
        createdUpdatedReadTimeStatus_other:
          "Created {{created}} · updated {{updated}} · {{count, number}} min read · {{status}}",
      },
      states: {
        empty: "This document is empty.",
        loading: "Loading document…",
        missing: "This document is not available here. Choose another document.",
      },
      statuses: {
        accepted: "Accepted",
        active: "Active",
        complete: "Complete",
        deprecated: "Deprecated",
        proposed: "Proposed",
        rejected: "Rejected",
        superseded: "Superseded",
        unavailable: "Status unavailable",
      },
      truncation: {
        bytes_one:
          "Showing the first {{returned, number}} of {{count, number}} byte. Open the file for the full document.",
        bytes_other:
          "Showing the first {{returned, number}} of {{count, number}} bytes. Open the file for the full document.",
      },
    },
    comments: {
      accessibility: {
        commentsToReview: "Comments to review",
        editComment: "Edit comment",
        newComment: "New comment",
        sectionComments: "Section comments",
      },
      actions: {
        add: "Add comment",
        close: "Close comments",
        copyLink: "Copy link",
        edit: "Edit comment",
        open: "Open comments",
        reopen: "Reopen comment",
        resolve: "Resolve comment",
        save: "Save comment",
        tryAgain: "Try again",
      },
      authorKinds: {
        agent: "Assistant",
        human: "You",
        system: "System",
        toolExecutor: "Automation",
        unknown: "Unknown author",
      },
      confirmations: {
        delete: {
          title: "Delete this comment?",
          body: "Delete this comment permanently. This cannot be undone.",
        },
      },
      connectionIssues: {
        ambiguous:
          "More than one section matches this comment. Rename a heading, then move the comment.",
        changed: "This section has changed. Move the comment to this section.",
        malformed:
          "This comment's section could not be found. Move the comment to another section.",
        missing:
          "This section is no longer available. Move the comment to another section.",
      },
      counts: {
        commentsToReview_one: "{{count, number}} comment to review",
        commentsToReview_other: "{{count, number}} comments to review",
        days_one: "{{count, number}} day ago",
        days_other: "{{count, number}} days ago",
        hours_one: "{{count, number}} hour ago",
        hours_other: "{{count, number}} hours ago",
        minutes_one: "{{count, number}} minute ago",
        minutes_other: "{{count, number}} minutes ago",
        months_one: "{{count, number}} month ago",
        months_other: "{{count, number}} months ago",
        years_one: "{{count, number}} year ago",
        years_other: "{{count, number}} years ago",
      },
      descriptions: {
        attachedToSection: "Comments stay with this section.",
      },
      disabledReasons: {
        actorPreparing: "Wait for comments to finish preparing.",
        duplicateHeading: "Rename a matching heading, then add your comment.",
      },
      emptyStates: {
        noComments: "No comments on this section yet.",
        noCommentsToReview: "No comments to review.",
      },
      errors: {
        actorUnavailable:
          "Comments are unavailable. Close the comments, then try again.",
        addFailed: "The comment could not be added. Try again.",
        copyLinkFailed: "The link could not be copied. Try again.",
        deleteFailed: "The comment could not be deleted. Try again.",
        loadFailed: "Comments could not be loaded. Try again.",
        moveFailed: "The comment could not be moved. Try again.",
        reopenFailed: "The comment could not be reopened. Try again.",
        resolveFailed: "The comment could not be resolved. Try again.",
        saveFailed: "The comment could not be saved. Try again.",
      },
      feedback: {
        added: "Comment added.",
        deleted: "Comment deleted.",
        moved: "Comment moved.",
        reopened: "Comment reopened.",
        resolved: "Comment resolved.",
        saved: "Comment saved.",
      },
      placeholders: {
        newComment: "Add a comment…",
      },
      states: {
        justNow: "Just now",
        loading: "Loading comments…",
        preparing: "Preparing comments…",
        resolved: "Resolved",
      },
    },
    properties: {
      actions: {
        rename: "Rename document",
        save: "Save properties",
      },
      emptyStates: {
        newFeatureTag: "Enter a new feature tag",
      },
      labels: {
        date: "Date",
        documentName: "Document name",
        documentType: "Document type",
        feature: "Feature",
        relatedDocuments: "Related documents",
      },
      placeholders: {
        date: "YYYY-MM-DD",
        featureTag: "Enter a feature tag",
      },
      states: {
        notSet: "Not set",
        renaming: "Renaming document…",
        saving: "Saving properties…",
      },
    },
  },
  workspace: {
    accessibility: {
      codeViewer: "Code viewer",
      documentViewer: "Document viewer",
      inWorkspace: "In workspace {{workspace}}",
    },
  },
  disabledReasons: {
    chooseTemporaryTab: "Choose a temporary tab to keep open.",
    copyChangesBeforeReopening:
      "Copy your changes, then reopen the document before saving.",
    openForEditing: "Open a document for editing.",
    openDocument: "Open a document first.",
    openAnotherDocument: "Open another document, then try again.",
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
  tree: {
    created: "Created {{date}}",
    decisionStatusAccepted: "Accepted",
    decisionStatusDeprecated: "Retired",
    decisionStatusProposed: "Proposed",
    decisionStatusRejected: "Rejected",
    decisionStatusSuperseded: "Replaced",
    degraded: "Some documents are temporarily unavailable.",
    lastEdited: "Last edited {{date}}",
    emptyWorktree: "No documents in this worktree yet.",
    loading: "Loading documents…",
    noFilterMatches: "No documents match this filter.",
    noFilterMatchesYet: "No matches yet. The list is still loading.",
    partialAnnouncement: "Loading the remaining documents.",
    partialCount_one:
      "Loading the full list. {{count, number}} document available so far.",
    partialCount_other:
      "Loading the full list. {{count, number}} documents available so far.",
    planProgress: "{{done, number}} of {{total, number}} completed",
    sizeSummary_one: "{{count, number}} word, {{size}}",
    sizeSummary_other: "{{count, number}} words, {{size}}",
    unavailable: "Documents are unavailable. Refresh the app and try again.",
    updated: "Updated {{date}}",
    vaultBrowser: "Vault browser",
    wordCount_one: "{{count, number}} word",
    wordCount_other: "{{count, number}} words",
    weightBelowThreshold: "Less than {{threshold}}",
  },
  labels: {
    document: "Document",
    vault: "Vault",
  },
  sortOptions: {
    latestActivity: "Latest activity",
    documentCount: "Document count",
    name: "Name",
    creationDate: "Creation date",
    editDate: "Edit date",
    length: "Length",
    workspaceShare: "Workspace share",
  },
  shortcutGroups: {
    documents: "Documents",
    editing: "Document editing",
  },
} as const;
