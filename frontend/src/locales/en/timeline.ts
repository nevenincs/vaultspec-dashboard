export const timeline = {
  accessibility: {
    dateField: "Timeline date",
  },
  actions: {
    filterByCreationDate: "Filter by creation date",
    filterByCreationDateCurrent: "Filter by creation date (current)",
    filterByEditDate: "Filter by edit date",
    filterByEditDateCurrent: "Filter by edit date (current)",
    filterByUpdateDate: "Filter by update date",
    filterByUpdateDateCurrent: "Filter by update date (current)",
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
    current: "Choose another date option to change the timeline.",
    modifiedUnavailable: "Choose the creation date. Edit dates aren't available here.",
    stampedUnavailable: "Choose the creation date. Update dates aren't available here.",
  },
} as const;
