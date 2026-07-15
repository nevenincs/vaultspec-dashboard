export function rawKeybindingPresentationFixture() {
  return {
    rawLabel: {
      id: "raw-label",
      defaultChord: "L",
      label: "Raw shortcut label",
      group: { key: "common:shortcutGroups.general" },
      context: "global",
    },
    rawGroup: {
      id: "raw-group",
      defaultChord: "G",
      label: { key: "common:actions.retry" },
      group: "Raw shortcut group",
      context: "global",
    },
  };
}
