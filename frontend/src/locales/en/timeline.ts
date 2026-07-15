export const timeline = {
  accessibility: {
    dateField: "Timeline date",
    loadingRange: "Loading date range",
    rangeEnd: "Range end",
    rangeStart: "Range start",
    selectedRange: "Selected date range",
  },
  actions: {
    clearDateRange: "Clear date range",
    filterByCreationDate: "Filter by creation date",
    filterByCreationDateCurrent: "Filter by creation date (current)",
    filterByEditDate: "Filter by edit date",
    filterByEditDateCurrent: "Filter by edit date (current)",
    filterByUpdateDate: "Filter by update date",
    filterByUpdateDateCurrent: "Filter by update date (current)",
    showLast24Hours: "Show the last 24 hours",
    showLast7Days: "Show the last 7 days",
    showLast30Days: "Show the last 30 days",
    showLast90Days: "Show the last 90 days",
    viewProjectAtVersion: "View project at this version",
  },
  criteria: {
    created: "Created",
    modified: "Edited",
    stamped: "Updated",
  },
  descriptions: {
    useCreationDateForRange: "Use the creation date for the range",
    useEditDateForRange: "Use the edit date for the range",
    useUpdateDateForRange: "Use the update date for the range",
  },
  disabledReasons: {
    codeFiles: "Choose the edit date. Code files use edit dates.",
    chooseProject: "Choose a project, then try again.",
    current: "Choose another date option to change the timeline.",
    modifiedUnavailable: "Choose the creation date. Edit dates aren't available here.",
    refreshHistory: "Refresh project history, then try again.",
    stampedUnavailable: "Choose the creation date. Update dates aren't available here.",
    switchToDocumentsForHistory: "Switch to documents to view project history.",
  },
  labels: {
    timeline: "Timeline",
  },
  states: {
    noDatedDocuments: "No dated documents in this view.",
    noDatedFiles: "No dated files in this view.",
    rangeUnavailable: "Date range is unavailable. Try again shortly.",
  },
  summaries: {
    selectedRange: "{{start}} to {{end}}",
  },
} as const;
