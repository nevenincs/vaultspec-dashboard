export const settings = {
  actions: {
    useDarkTheme: "Use dark theme",
    useHighContrastTheme: "Use high contrast theme",
    useLightTheme: "Use light theme",
    useSystemTheme: "Use system theme",
  },
  groups: {
    appearance: "Appearance",
    graph: "Graph",
    keybindings: "Keyboard shortcuts",
  },
  fields: {
    theme: { label: "Theme", description: "Choose the interface theme." },
    reduceMotion: {
      label: "Reduce motion",
      description: "Use fewer interface animations.",
    },
    activitySectionFolds: {
      label: "Activity sections",
      description: "Remember which activity sections are open.",
    },
    language: {
      label: "Language",
      description: "Choose the interface language.",
    },
    defaultGranularity: {
      label: "Default detail level",
      description: "Choose the starting graph detail.",
    },
    corpus: {
      label: "Graph content",
      description: "Choose the content shown in the graph.",
    },
    timelineDate: {
      label: "Timeline date",
      description: "Choose which date controls the timeline.",
    },
    confidenceFloor: {
      label: "Minimum connection certainty",
      description: "Hide connections below this certainty.",
    },
    labelFilter: {
      label: "Name filter",
      description: "Show items with matching names.",
      placeholder: "Filter by name",
    },
    graphControls: {
      label: "Graph controls",
      description: "Customize graph navigation.",
    },
    shortcuts: {
      label: "Keyboard shortcuts",
      description: "Customize keyboard commands.",
    },
  },
  options: {
    system: "System",
    light: "Light",
    dark: "Dark",
    highContrast: "High contrast",
    english: "English",
  },
} as const;
