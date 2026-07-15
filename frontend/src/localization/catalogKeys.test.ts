import { describe, expect, it } from "vitest";

import { en, resources, sourceLocale, type EnglishResources } from "../locales/en";
import {
  isMessageKey,
  isPluralMessageKey,
  MESSAGE_KEYS,
  PHYSICAL_MESSAGE_KEYS,
  PLURAL_MESSAGE_KEYS,
  type MessageKey,
  type PhysicalMessageKey,
} from "../platform/localization/message";
import {
  createLocalizationRuntime,
  localizationNamespaces,
  supportedLocales,
} from "../platform/localization/runtime";
import { createTestLocalizationRuntime, ltrTestLocale, rtlTestLocale } from "./testing";

const EXPECTED_SHIPPED_LOCALES = ["en"] as const;
const EXPECTED_NAMESPACES = [
  "common",
  "documents",
  "errors",
  "features",
  "graph",
  "operations",
  "projects",
  "settings",
  "timeline",
] as const;
const EXPECTED_CATALOG_KEYS = [
  "common:accessibility.actionsForItem",
  "common:accessibility.actionsMenu",
  "common:accessibility.back",
  "common:accessibility.confirmAction",
  "common:accessibility.recordShortcut",
  "common:accessibility.resizeActivityPanel",
  "common:accessibility.resizeNavigationPanel",
  "common:accessibility.resizeTimeline",
  "common:accessibility.resetShortcut",
  "common:accessibility.skipToContent",
  "common:accessibility.switchWorkspace",
  "common:actions.cancel",
  "common:actions.close",
  "common:actions.collapseNavigationPanel",
  "common:actions.copy",
  "common:actions.copyBranchName",
  "common:actions.copyCategoryName",
  "common:actions.copyCommitHash",
  "common:actions.copyCommitMessage",
  "common:actions.copyDocumentName",
  "common:actions.copyFeatureTag",
  "common:actions.copyPath",
  "common:actions.copyPullRequestLink",
  "common:actions.copyPullRequestNumber",
  "common:actions.copyShortCommitHash",
  "common:actions.copySummary",
  "common:actions.copyTitle",
  "common:actions.disableFollowMode",
  "common:actions.enableFollowMode",
  "common:actions.expandNavigationPanel",
  "common:actions.hideActivityPanel",
  "common:actions.hideApprovals",
  "common:actions.hideGraph",
  "common:actions.hideNavigationPanel",
  "common:actions.hideProjectHealth",
  "common:actions.hideSearchStatus",
  "common:actions.hideSystemStatus",
  "common:actions.hideTimeline",
  "common:actions.moveToNextPanel",
  "common:actions.moveToPreviousPanel",
  "common:actions.open",
  "common:actions.openCommandPalette",
  "common:actions.openInEditor",
  "common:actions.openSettings",
  "common:actions.refreshData",
  "common:actions.reloadPage",
  "common:actions.reset",
  "common:actions.resetLayout",
  "common:actions.retry",
  "common:actions.searchDocumentsAndCode",
  "common:actions.showActivityPanel",
  "common:actions.showApprovals",
  "common:actions.showChanges",
  "common:actions.showGraph",
  "common:actions.showNavigationPanel",
  "common:actions.showOrHideGraph",
  "common:actions.showInFileManager",
  "common:actions.showKeyboardShortcuts",
  "common:actions.showOnCanvas",
  "common:actions.showProjectHealth",
  "common:actions.showSearchStatus",
  "common:actions.showStatus",
  "common:actions.showSystemStatus",
  "common:actions.showTimeline",
  "common:activityTabs.changes",
  "common:activityTabs.status",
  "common:commandFamilies.editing",
  "common:commandFamilies.filters",
  "common:commandFamilies.focus",
  "common:commandFamilies.general",
  "common:commandFamilies.help",
  "common:commandFamilies.layout",
  "common:commandFamilies.navigation",
  "common:commandFamilies.refresh",
  "common:commandFamilies.search",
  "common:commandFamilies.searchMaintenance",
  "common:commandFamilies.settings",
  "common:commandFamilies.workspaceMaintenance",
  "common:commandPalette.dialogLabel",
  "common:commandPalette.inputPlaceholder",
  "common:commandPalette.listboxLabel",
  "common:commandPalette.noMatches",
  "common:commandPalette.loading",
  "common:commandPalette.selectionAnnouncement_one",
  "common:commandPalette.selectionAnnouncement_other",
  "common:commandPalette.footer.navigate",
  "common:commandPalette.footer.open",
  "common:commandPalette.footer.close",
  "common:controlPanels.labels.search",
  "common:controlPanels.labels.projectHealth",
  "common:controlPanels.labels.systemStatus",
  "common:controlPanels.labels.approvals",
  "common:controlPanels.actions.showSearch",
  "common:controlPanels.actions.hideSearch",
  "common:controlPanels.actions.showProjectHealth",
  "common:controlPanels.actions.hideProjectHealth",
  "common:controlPanels.actions.showSystemStatus",
  "common:controlPanels.actions.hideSystemStatus",
  "common:controlPanels.actions.showApprovals",
  "common:controlPanels.actions.hideApprovals",
  "common:controlPanels.unavailableTitles.search",
  "common:controlPanels.unavailableTitles.projectHealth",
  "common:controlPanels.unavailableTitles.systemStatus",
  "common:controlPanels.unavailableTitles.approvals",
  "common:controlPanels.accessibility.group",
  "common:controlPanels.accessibility.panelStatus",
  "common:controlPanels.tones.workingNormally",
  "common:controlPanels.tones.needsAttention",
  "common:controlPanels.tones.unavailable",
  "common:controlPanels.tones.checking",
  "common:disabledReasons.actionUnavailable",
  "common:disabledReasons.currentVersionRequired",
  "common:disabledReasons.desktopEditorRequired",
  "common:disabledReasons.desktopFileManagerRequired",
  "common:disabledReasons.itemUnavailableOnCanvas",
  "common:disabledReasons.selectItemToOpen",
  "common:feedback.actionUnavailable",
  "common:feedback.copyFailed",
  "common:feedback.copySucceeded",
  "common:destructiveActions.discardChanges",
  "common:shortcutDialog.description",
  "common:shortcutDialog.title",
  "common:shortcutSettings.conflict",
  "common:shortcutSettings.empty",
  "common:shortcutSettings.recording",
  "common:shortcutGroups.navigation",
  "common:shortcutGroups.general",
  "common:shortcutGroups.graph",
  "common:shortcutGroups.window",
  "common:keycaps.alt",
  "common:keycaps.arrowDown",
  "common:keycaps.arrowLeft",
  "common:keycaps.arrowRight",
  "common:keycaps.arrowUp",
  "common:keycaps.backspace",
  "common:keycaps.control",
  "common:keycaps.delete",
  "common:keycaps.end",
  "common:keycaps.enter",
  "common:keycaps.escape",
  "common:keycaps.home",
  "common:keycaps.insert",
  "common:keycaps.pageDown",
  "common:keycaps.pageUp",
  "common:keycaps.shift",
  "common:keycaps.space",
  "common:keycaps.tab",
  "common:palette.commandCount_one",
  "common:palette.commandCount_other",
  "common:statuses.noActionsAvailable",
  "documents:accessibility.addDocumentToFeature",
  "documents:accessibility.browserView",
  "documents:accessibility.decisionAccepted",
  "documents:accessibility.decisionDeprecated",
  "documents:accessibility.decisionProposed",
  "documents:accessibility.decisionRejected",
  "documents:accessibility.decisionSuperseded",
  "documents:accessibility.planComplete",
  "documents:accessibility.planInProgress",
  "documents:accessibility.planNotStarted",
  "documents:accessibility.treeBrowser",
  "documents:accessibility.switchReadingAndEditingShortcut",
  "documents:accessibility.treeOptionsSortedByCreationDate",
  "documents:accessibility.treeOptionsSortedByDocumentCount",
  "documents:accessibility.treeOptionsSortedByEditDate",
  "documents:accessibility.treeOptionsSortedByLatestActivity",
  "documents:accessibility.treeOptionsSortedByLength",
  "documents:accessibility.treeOptionsSortedByName",
  "documents:accessibility.treeOptionsSortedByWorkspaceShare",
  "documents:codeTree.accessibility.browser",
  "documents:codeTree.accessibility.linkedToMap",
  "documents:codeTree.errors.childUnavailable",
  "documents:codeTree.errors.unavailable",
  "documents:codeTree.states.childLoading",
  "documents:codeTree.states.degraded",
  "documents:codeTree.states.empty",
  "documents:codeTree.states.loading",
  "documents:codeTree.states.truncated",
  "documents:codeTree.states.truncatedUnknown",
  "documents:confirmations.discardUnsavedChanges.body",
  "documents:confirmations.discardUnsavedChanges.title",
  "documents:editor.accessibility.formattingToolbar",
  "documents:editor.actions.bold",
  "documents:editor.actions.bulletedList",
  "documents:editor.actions.heading",
  "documents:editor.actions.inlineCode",
  "documents:editor.actions.italic",
  "documents:editor.actions.link",
  "documents:editor.actions.linkToDocument",
  "documents:editor.actions.numberedList",
  "documents:editor.actions.quote",
  "documents:viewer.accessibility.documentMode",
  "documents:viewer.accessibility.documentProperties",
  "documents:viewer.accessibility.featureTag",
  "documents:viewer.modes.edit",
  "documents:viewer.modes.view",
  "documents:viewer.properties.actions.rename",
  "documents:viewer.properties.actions.save",
  "documents:viewer.properties.emptyStates.newFeatureTag",
  "documents:viewer.properties.labels.date",
  "documents:viewer.properties.labels.documentName",
  "documents:viewer.properties.labels.documentType",
  "documents:viewer.properties.labels.feature",
  "documents:viewer.properties.labels.relatedDocuments",
  "documents:viewer.properties.placeholders.date",
  "documents:viewer.properties.placeholders.featureTag",
  "documents:viewer.properties.states.notSet",
  "documents:viewer.properties.states.renaming",
  "documents:viewer.properties.states.saving",
  "documents:actions.addComment",
  "documents:actions.addToFeature",
  "documents:actions.browseDocuments",
  "documents:actions.browseFiles",
  "documents:actions.closeActiveTab",
  "documents:actions.closeAllDocuments",
  "documents:actions.closeDocument",
  "documents:actions.closeOtherDocuments",
  "documents:actions.clearFilter",
  "documents:actions.collapseCategory",
  "documents:actions.collapseTree",
  "documents:actions.copyLink",
  "documents:actions.expandTree",
  "documents:actions.expandCategory",
  "documents:actions.findByName",
  "documents:actions.finishEditing",
  "documents:actions.focusFilter",
  "documents:actions.keepDocumentOpen",
  "documents:actions.keepTabOpen",
  "documents:actions.linkToSelectedDocument",
  "documents:actions.nextTab",
  "documents:actions.openComments",
  "documents:actions.previousTab",
  "documents:actions.resetFilters",
  "documents:actions.resetSorting",
  "documents:actions.reloadDocument",
  "documents:actions.save",
  "documents:actions.sortByCreationDate",
  "documents:actions.sortByDocumentCount",
  "documents:actions.sortByEditDate",
  "documents:actions.sortByLatestActivity",
  "documents:actions.sortByLength",
  "documents:actions.sortByName",
  "documents:actions.sortByWorkspaceShare",
  "documents:actions.showOrHideFilterOptions",
  "documents:actions.filterByDocumentType",
  "documents:actions.showOrHideChanges",
  "documents:actions.switchReadingAndEditing",
  "documents:actions.switchView",
  "documents:browserModes.documents",
  "documents:browserModes.files",
  "documents:categories.code",
  "documents:createDialog.accessibility.addLinkedDocument",
  "documents:createDialog.accessibility.backToFeature",
  "documents:createDialog.accessibility.documentType",
  "documents:createDialog.accessibility.feature",
  "documents:createDialog.accessibility.linkedDocuments",
  "documents:createDialog.accessibility.pipelineCoverage",
  "documents:createDialog.accessibility.removeLinkedDocument",
  "documents:createDialog.accessibility.title",
  "documents:createDialog.actions.back",
  "documents:createDialog.actions.continue",
  "documents:createDialog.actions.create",
  "documents:createDialog.actions.creating",
  "documents:createDialog.descriptions.documentStage",
  "documents:createDialog.descriptions.featureStage",
  "documents:createDialog.documentTypes.adr",
  "documents:createDialog.documentTypes.audit",
  "documents:createDialog.documentTypes.document",
  "documents:createDialog.documentTypes.exec",
  "documents:createDialog.documentTypes.plan",
  "documents:createDialog.documentTypes.reference",
  "documents:createDialog.documentTypes.research",
  "documents:createDialog.emptyStates.createFeatureTag",
  "documents:createDialog.emptyStates.noMatchingDocuments",
  "documents:createDialog.errors.createFailed",
  "documents:createDialog.errors.inFlight",
  "documents:createDialog.errors.pathCollision",
  "documents:createDialog.errors.projectChanged",
  "documents:createDialog.errors.scopeChanged",
  "documents:createDialog.hints.adr",
  "documents:createDialog.hints.audit",
  "documents:createDialog.hints.notAvailable",
  "documents:createDialog.hints.plan",
  "documents:createDialog.hints.reference",
  "documents:createDialog.hints.requiresDecision",
  "documents:createDialog.hints.requiresResearchOrReference",
  "documents:createDialog.hints.research",
  "documents:createDialog.labels.documentType",
  "documents:createDialog.labels.feature",
  "documents:createDialog.labels.inThisFeature",
  "documents:createDialog.labels.linkedDocuments",
  "documents:createDialog.labels.title",
  "documents:createDialog.placeholders.addLinkedDocument",
  "documents:createDialog.placeholders.documentTitle",
  "documents:createDialog.placeholders.featureTag",
  "documents:createDialog.stages.document",
  "documents:createDialog.stages.feature",
  "documents:createDialog.states.checkingCoverage",
  "documents:createDialog.states.chooseFeatureForCoverage",
  "documents:createDialog.states.coverageUnavailable",
  "documents:createDialog.states.emptyFeature",
  "documents:createDialog.states.nextStep",
  "documents:createDialog.states.notYet",
  "documents:createDialog.states.present",
  "documents:createDialog.states.selected",
  "documents:createDialog.titles.document",
  "documents:createDialog.titles.feature",
  "documents:createDialog.validation.chooseAvailableDocumentType",
  "documents:createDialog.validation.chooseDocumentType",
  "documents:createDialog.validation.chooseFeature",
  "documents:createDialog.validation.completeRequiredFields",
  "documents:createDialog.validation.requiresDecision",
  "documents:createDialog.validation.requiresResearchOrReference",
  "documents:documentTypes.adr",
  "documents:documentTypes.audit",
  "documents:documentTypes.exec",
  "documents:documentTypes.plan",
  "documents:documentTypes.reference",
  "documents:documentTypes.research",
  "documents:disabledReasons.chooseTemporaryTab",
  "documents:disabledReasons.copyChangesBeforeReopening",
  "documents:disabledReasons.openAnotherDocument",
  "documents:disabledReasons.openDocument",
  "documents:disabledReasons.openForEditing",
  "documents:disabledReasons.selectDifferentDocument",
  "documents:disabledReasons.selectDocument",
  "documents:disabledReasons.tryAfterSaving",
  "documents:disabledReasons.updateBeforeSaving",
  "documents:feedback.alreadyLinked",
  "documents:feedback.linkConflict",
  "documents:feedback.linkFailed",
  "documents:feedback.linkInProgress",
  "documents:feedback.linkSucceeded",
  "documents:tree.created",
  "documents:tree.decisionStatusAccepted",
  "documents:tree.decisionStatusDeprecated",
  "documents:tree.decisionStatusProposed",
  "documents:tree.decisionStatusRejected",
  "documents:tree.decisionStatusSuperseded",
  "documents:tree.degraded",
  "documents:tree.lastEdited",
  "documents:tree.emptyWorktree",
  "documents:tree.loading",
  "documents:tree.noFilterMatches",
  "documents:tree.noFilterMatchesYet",
  "documents:tree.partialAnnouncement",
  "documents:tree.partialCount_one",
  "documents:tree.partialCount_other",
  "documents:tree.planProgress",
  "documents:tree.sizeSummary_one",
  "documents:tree.sizeSummary_other",
  "documents:tree.unavailable",
  "documents:tree.updated",
  "documents:tree.vaultBrowser",
  "documents:tree.wordCount_one",
  "documents:tree.wordCount_other",
  "documents:tree.weightBelowThreshold",
  "documents:labels.document",
  "documents:labels.vault",
  "documents:sortOptions.creationDate",
  "documents:sortOptions.documentCount",
  "documents:sortOptions.editDate",
  "documents:sortOptions.latestActivity",
  "documents:sortOptions.length",
  "documents:sortOptions.name",
  "documents:sortOptions.workspaceShare",
  "documents:shortcutGroups.documents",
  "documents:shortcutGroups.editing",
  "errors:fallback.contentUnavailable",
  "errors:unexpectedApplication.message",
  "errors:unexpectedApplication.title",
  "errors:unexpectedSection.message",
  "errors:unexpectedSection.title",
  "features:actions.collapse",
  "features:actions.expand",
  "features:actions.moveToNextFeature",
  "features:actions.moveToPreviousFeature",
  "features:actions.filterByFeature",
  "features:confirmations.archive.body",
  "features:confirmations.archive.title",
  "features:confirmations.repair.body",
  "features:confirmations.repair.title",
  "features:destructiveActions.archive",
  "features:disabledReasons.selectFeature",
  "features:feedback.archiveRejected",
  "features:feedback.archiveSucceeded",
  "features:feedback.archiveUnavailable",
  "features:feedback.repairRejected",
  "features:feedback.repairSucceeded",
  "features:feedback.repairUnavailable",
  "features:guardedActions.repair",
  "features:labels.feature",
  "graph:accessibility.selectedItem",
  "graph:accessibility.selectedItemGeneric",
  "graph:accessibility.workingSet",
  "graph:accessibility.workingSetCount_one",
  "graph:accessibility.workingSetCount_other",
  "graph:accessibility.hiddenByActiveFilter",
  "graph:accessibility.namedWorkingSetItemHidden",
  "graph:accessibility.workingSetItemHidden",
  "graph:actions.addItemToWorkingSet",
  "graph:actions.addSelectedItemToWorkingSet",
  "graph:actions.clearSelection",
  "graph:actions.clearWorkingSet",
  "graph:actions.expandFocusedItem",
  "graph:actions.fitToView",
  "graph:actions.moveToNextConnectedItem",
  "graph:actions.moveToPreviousConnectedItem",
  "graph:actions.openFocusedItem",
  "graph:actions.pauseMovement",
  "graph:actions.pinItem",
  "graph:actions.resetSettings",
  "graph:actions.resetView",
  "graph:actions.removeItemFromWorkingSet",
  "graph:actions.removeNamedItemFromWorkingSet",
  "graph:actions.removeLastItemFromWorkingSet",
  "graph:actions.resumeMovement",
  "graph:actions.showRelatedItem",
  "graph:actions.showStartingItem",
  "graph:actions.unpinItem",
  "graph:actions.zoomIn",
  "graph:actions.zoomOut",
  "graph:disabledReasons.chooseConnectionWithSummary",
  "graph:disabledReasons.chooseItemWithTitle",
  "graph:disabledReasons.relatedItemUnavailable",
  "graph:disabledReasons.startingItemUnavailable",
  "graph:legend.accessibility.documentTypeFilters",
  "graph:legend.accessibility.moduleColors",
  "graph:legend.accessibility.recencyScale",
  "graph:legend.actions.addDocumentTypeFilter",
  "graph:legend.actions.clearDocumentTypeFilters",
  "graph:legend.actions.hideDocumentTypeLabels",
  "graph:legend.actions.hideModuleLabels",
  "graph:legend.actions.removeDocumentTypeFilter",
  "graph:legend.actions.showDocumentTypeLabels",
  "graph:legend.actions.showModuleLabels",
  "graph:legend.labels.older",
  "graph:legend.labels.recent",
  "graph:shortcutGroups.workingSet",
  "graph:labels.item",
  "operations:actions.applySearchSettings",
  "operations:actions.checkWorkspace",
  "operations:actions.disableSearch",
  "operations:actions.enableSearch",
  "operations:actions.refreshSearch",
  "operations:actions.showWorkspaceDetails",
  "operations:feedback.applySearchSettings.failed",
  "operations:feedback.applySearchSettings.running",
  "operations:feedback.applySearchSettings.succeeded",
  "operations:feedback.applySearchSettings.unavailable",
  "operations:feedback.checkWorkspace.failed",
  "operations:feedback.checkWorkspace.running",
  "operations:feedback.checkWorkspace.succeeded",
  "operations:feedback.disableSearch.failed",
  "operations:feedback.disableSearch.running",
  "operations:feedback.disableSearch.succeeded",
  "operations:feedback.enableSearch.failed",
  "operations:feedback.enableSearch.running",
  "operations:feedback.enableSearch.succeeded",
  "operations:feedback.enableSearch.unavailable",
  "operations:feedback.refreshSearch.failed",
  "operations:feedback.refreshSearch.running",
  "operations:feedback.refreshSearch.succeeded",
  "operations:feedback.refreshSearch.unavailable",
  "operations:feedback.showWorkspaceDetails.failed",
  "operations:feedback.showWorkspaceDetails.running",
  "operations:feedback.showWorkspaceDetails.succeeded",
  "projects:actions.add",
  "projects:actions.checkProjectStatus",
  "projects:actions.clearHistory",
  "projects:actions.openPullRequest",
  "projects:actions.prepareProjectTools",
  "projects:actions.setUpProject",
  "projects:actions.switch",
  "projects:actions.switchWorktree",
  "projects:actions.updateProject",
  "projects:actions.updateProjectTools",
  "projects:addDialog.accessibility.folderPath",
  "projects:addDialog.actions.add",
  "projects:addDialog.actions.adding",
  "projects:addDialog.actions.pickFolder",
  "projects:addDialog.description",
  "projects:addDialog.errors.addFailed",
  "projects:addDialog.errors.alreadyAdded",
  "projects:addDialog.errors.folderUnavailable",
  "projects:addDialog.errors.notGitProject",
  "projects:addDialog.errors.pathRequired",
  "projects:addDialog.fields.folder",
  "projects:addDialog.placeholders.folderPath",
  "projects:addDialog.title",
  "projects:confirmations.replaceSetup.body",
  "projects:confirmations.replaceSetup.title",
  "projects:destructiveActions.replaceSetup",
  "projects:disabledReasons.chooseWorktreeWithProjectFiles",
  "projects:disabledReasons.installRequiredProjectTools",
  "projects:disabledReasons.noSetupChangesNeeded",
  "projects:disabledReasons.prepareFolderAsGitProject",
  "projects:disabledReasons.refreshProjectForPullRequest",
  "projects:disabledReasons.setUpProjectFirst",
  "projects:disabledReasons.waitForProjectStatus",
  "projects:folderBrowser.accessibility.filterFolders",
  "projects:folderBrowser.accessibility.folderOptionGitRepository",
  "projects:folderBrowser.accessibility.folderOptionHidden",
  "projects:folderBrowser.accessibility.folderOptionProject",
  "projects:folderBrowser.accessibility.folderOptionRegistered",
  "projects:folderBrowser.accessibility.folders",
  "projects:folderBrowser.accessibility.showHiddenFolders",
  "projects:folderBrowser.badges.alreadyAdded",
  "projects:folderBrowser.badges.gitRepository",
  "projects:folderBrowser.badges.hidden",
  "projects:folderBrowser.badges.project",
  "projects:folderBrowser.empty.noMatches",
  "projects:folderBrowser.empty.noSubfolders",
  "projects:folderBrowser.errors.readFailed",
  "projects:folderBrowser.errors.readFailedHint",
  "projects:folderBrowser.labels.filterFolders",
  "projects:folderBrowser.labels.hidden",
  "projects:folderBrowser.labels.roots",
  "projects:folderBrowser.states.loading",
  "projects:folderBrowser.states.truncated",
  "projects:placesRail.labels.home",
  "projects:placesRail.labels.places",
  "projects:placesRail.sections.drives",
  "projects:placesRail.sections.projects",
  "projects:placesRail.sections.recent",
  "projects:provisioning.description",
  "projects:provisioning.details.installRequiredProjectTools",
  "projects:provisioning.details.prepareFolderAsGitProject",
  "projects:provisioning.progress",
  "projects:provisioning.result.completed",
  "projects:provisioning.result.failed",
  "projects:provisioning.result.indeterminate",
  "projects:provisioning.result.itemCount_one",
  "projects:provisioning.result.itemCount_other",
  "projects:provisioning.result.status.created",
  "projects:provisioning.result.status.failed",
  "projects:provisioning.result.status.mixed",
  "projects:provisioning.result.status.removed",
  "projects:provisioning.result.status.restored",
  "projects:provisioning.result.status.skipped",
  "projects:provisioning.result.status.updated",
  "projects:provisioning.result.status.upToDate",
  "projects:provisioning.startFailed",
  "projects:provisioning.statusUnavailable",
  "projects:provisioning.title",
  "projects:shortcutGroups.projects",
  "settings:actions.useDarkTheme",
  "settings:actions.useHighContrastTheme",
  "settings:actions.useLightTheme",
  "settings:actions.useSystemTheme",
  "settings:fields.activitySectionFolds.description",
  "settings:fields.activitySectionFolds.label",
  "settings:fields.confidenceFloor.description",
  "settings:fields.confidenceFloor.label",
  "settings:fields.corpus.description",
  "settings:fields.corpus.label",
  "settings:fields.defaultGranularity.description",
  "settings:fields.defaultGranularity.label",
  "settings:fields.graphControls.description",
  "settings:fields.graphControls.label",
  "settings:fields.labelFilter.description",
  "settings:fields.labelFilter.label",
  "settings:fields.labelFilter.placeholder",
  "settings:fields.language.description",
  "settings:fields.language.label",
  "settings:fields.reduceMotion.description",
  "settings:fields.reduceMotion.label",
  "settings:fields.shortcuts.description",
  "settings:fields.shortcuts.label",
  "settings:fields.theme.description",
  "settings:fields.theme.label",
  "settings:fields.timelineDate.description",
  "settings:fields.timelineDate.label",
  "settings:groups.appearance",
  "settings:groups.graph",
  "settings:groups.keybindings",
  "settings:options.dark",
  "settings:options.english",
  "settings:options.highContrast",
  "settings:options.light",
  "settings:options.system",
  "timeline:accessibility.dateField",
  "timeline:actions.clearDateRange",
  "timeline:actions.filterByCreationDate",
  "timeline:actions.filterByCreationDateCurrent",
  "timeline:actions.filterByEditDate",
  "timeline:actions.filterByEditDateCurrent",
  "timeline:actions.filterByUpdateDate",
  "timeline:actions.filterByUpdateDateCurrent",
  "timeline:actions.showLast24Hours",
  "timeline:actions.showLast7Days",
  "timeline:actions.showLast30Days",
  "timeline:actions.showLast90Days",
  "timeline:actions.viewProjectAtVersion",
  "timeline:criteria.created",
  "timeline:criteria.modified",
  "timeline:criteria.stamped",
  "timeline:descriptions.useCreationDateForRange",
  "timeline:descriptions.useEditDateForRange",
  "timeline:descriptions.useUpdateDateForRange",
  "timeline:disabledReasons.codeFiles",
  "timeline:disabledReasons.chooseProject",
  "timeline:disabledReasons.current",
  "timeline:disabledReasons.modifiedUnavailable",
  "timeline:disabledReasons.refreshHistory",
  "timeline:disabledReasons.stampedUnavailable",
  "timeline:disabledReasons.switchToDocumentsForHistory",
  "timeline:labels.timeline",
] as const satisfies readonly PhysicalMessageKey[];

const EXPECTED_PUBLIC_MESSAGE_KEYS = [
  ...EXPECTED_CATALOG_KEYS.filter(
    (key) =>
      !/^(?:common:(?:palette\.commandCount|commandPalette\.selectionAnnouncement)|documents:tree\.(?:partialCount|sizeSummary|wordCount)|graph:accessibility\.workingSetCount|projects:provisioning\.result\.itemCount)_(?:one|other)$/u.test(
        key,
      ),
  ),
  "common:commandPalette.selectionAnnouncement",
  "common:palette.commandCount",
  "documents:tree.partialCount",
  "documents:tree.sizeSummary",
  "documents:tree.wordCount",
  "graph:accessibility.workingSetCount",
  "projects:provisioning.result.itemCount",
] as readonly MessageKey[];

function splitMessageKey(key: PhysicalMessageKey): {
  namespace: keyof EnglishResources & string;
  path: string;
} {
  const separator = key.indexOf(":");
  return {
    namespace: key.slice(0, separator) as keyof EnglishResources & string,
    path: key.slice(separator + 1),
  };
}

function discoverLeafKeys(catalog: Readonly<Record<string, unknown>>): string[] {
  const keys: string[] = [];

  const visit = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      keys.push(path);
      return;
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      keys.push(`${path}:invalid-leaf`);
      return;
    }
    for (const [segment, child] of Object.entries(value)) {
      visit(child, path.length === 0 ? segment : `${path}.${segment}`);
    }
  };

  for (const [namespace, bundle] of Object.entries(catalog)) {
    if (bundle === null || typeof bundle !== "object" || Array.isArray(bundle)) {
      keys.push(`${namespace}:invalid-bundle`);
      continue;
    }
    for (const [segment, child] of Object.entries(bundle)) {
      visit(child, `${namespace}:${segment}`);
    }
  }
  return keys.sort();
}

describe("shipped localization catalog keys", () => {
  it("matches the explicit namespace-qualified leaf-key contract", () => {
    expect([...PHYSICAL_MESSAGE_KEYS].sort()).toEqual(
      [...EXPECTED_CATALOG_KEYS].sort(),
    );
    expect([...MESSAGE_KEYS].sort()).toEqual([...EXPECTED_PUBLIC_MESSAGE_KEYS].sort());
    expect(PLURAL_MESSAGE_KEYS).toEqual([
      "common:commandPalette.selectionAnnouncement",
      "common:palette.commandCount",
      "documents:tree.partialCount",
      "documents:tree.sizeSummary",
      "documents:tree.wordCount",
      "graph:accessibility.workingSetCount",
      "projects:provisioning.result.itemCount",
    ]);
    expect(isPluralMessageKey("common:palette.commandCount")).toBe(true);
    expect(isPluralMessageKey("projects:provisioning.result.itemCount")).toBe(true);
    expect(isMessageKey("common:palette.commandCount_one")).toBe(false);
    for (const key of EXPECTED_PUBLIC_MESSAGE_KEYS) {
      expect(isMessageKey(key), key).toBe(true);
    }

    for (const [locale, catalog] of Object.entries(resources)) {
      expect(discoverLeafKeys(catalog), locale).toEqual(
        [...EXPECTED_CATALOG_KEYS].sort(),
      );
    }
  });

  it("keeps shipped locale and namespace aggregates aligned with the source catalog", () => {
    expect(resources[sourceLocale]).toBe(en);
    expect([...supportedLocales].sort()).toEqual([...EXPECTED_SHIPPED_LOCALES].sort());
    expect(Object.keys(resources).sort()).toEqual([...EXPECTED_SHIPPED_LOCALES].sort());
    expect([...localizationNamespaces].sort()).toEqual([...EXPECTED_NAMESPACES].sort());
    expect(Object.keys(en).sort()).toEqual([...EXPECTED_NAMESPACES].sort());

    for (const [locale, catalog] of Object.entries(resources)) {
      expect(Object.keys(catalog).sort(), locale).toEqual(
        [...EXPECTED_NAMESPACES].sort(),
      );
    }
  });

  it("provides every required message directly in every shipped locale", () => {
    const runtime = createLocalizationRuntime();

    for (const locale of supportedLocales) {
      for (const key of EXPECTED_CATALOG_KEYS) {
        const { namespace, path } = splitMessageKey(key);
        const value = runtime.getResource(locale, namespace, path);
        expect(typeof value, `${locale}:${key}`).toBe("string");
        expect((value as string).trim().length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("initializes the source locale from the exported source catalog", () => {
    const runtime = createLocalizationRuntime();

    for (const namespace of localizationNamespaces) {
      expect(runtime.getResourceBundle(sourceLocale, namespace)).toEqual(en[namespace]);
    }
  });

  it("resolves shell presentation vocabulary in English, French, and Arabic", () => {
    const keys = [
      "common:activityTabs.status",
      "common:activityTabs.changes",
      "common:actions.showStatus",
      "common:actions.showChanges",
      "common:actions.showActivityPanel",
      "common:actions.hideActivityPanel",
      "common:accessibility.resizeNavigationPanel",
      "common:accessibility.resizeActivityPanel",
      "common:accessibility.resizeTimeline",
      "common:accessibility.skipToContent",
      "common:accessibility.back",
      "documents:actions.resetSorting",
      "documents:labels.vault",
      "timeline:labels.timeline",
    ] as const satisfies readonly MessageKey[];
    const englishRuntime = createTestLocalizationRuntime(sourceLocale);
    const frenchRuntime = createTestLocalizationRuntime(ltrTestLocale);
    const arabicRuntime = createTestLocalizationRuntime(rtlTestLocale);

    for (const key of keys) {
      const english = englishRuntime.t(key);
      const french = frenchRuntime.t(key);
      const arabic = arabicRuntime.t(key);
      expect(french, key).not.toBe(english);
      expect(arabic, key).not.toBe(english);
      expect(arabic, key).not.toBe(french);
    }
  });

  it("resolves timeline date vocabulary in English, French, and Arabic", () => {
    const keys = EXPECTED_CATALOG_KEYS.filter((key) => key.startsWith("timeline:"));
    const englishRuntime = createTestLocalizationRuntime(sourceLocale);
    const frenchRuntime = createTestLocalizationRuntime(ltrTestLocale);
    const arabicRuntime = createTestLocalizationRuntime(rtlTestLocale);

    for (const key of keys) {
      const english = englishRuntime.t(key);
      const french = frenchRuntime.t(key);
      const arabic = arabicRuntime.t(key);
      expect(french, key).not.toBe(english);
      expect(arabic, key).not.toBe(english);
      expect(arabic, key).not.toBe(french);
    }
  });

  it("resolves menu filters and canvas recovery copy in English, French, and Arabic", () => {
    const english = createTestLocalizationRuntime(sourceLocale);
    const french = createTestLocalizationRuntime(ltrTestLocale);
    const arabic = createTestLocalizationRuntime(rtlTestLocale);

    expect(english.t("documents:actions.filterByDocumentType")).toBe(
      "Filter by this document type",
    );
    expect(french.t("documents:actions.filterByDocumentType")).toBe(
      "Filtrer par ce type de document",
    );
    expect(arabic.t("documents:actions.filterByDocumentType")).toBe(
      "التصفية حسب نوع المستند هذا",
    );
    expect(english.t("documents:actions.expandCategory")).toBe("Expand category");
    expect(french.t("documents:actions.expandCategory")).toBe(
      "Développer la catégorie",
    );
    expect(arabic.t("documents:actions.expandCategory")).toBe("توسيع الفئة");
    expect(english.t("documents:actions.collapseCategory")).toBe("Collapse category");
    expect(french.t("documents:actions.collapseCategory")).toBe("Réduire la catégorie");
    expect(arabic.t("documents:actions.collapseCategory")).toBe("طي الفئة");
    expect(english.t("features:actions.filterByFeature")).toBe(
      "Filter by this feature",
    );
    expect(french.t("features:actions.filterByFeature")).toBe(
      "Filtrer par cette fonctionnalité",
    );
    expect(arabic.t("features:actions.filterByFeature")).toBe("التصفية حسب هذه الميزة");
    expect(english.t("common:disabledReasons.itemUnavailableOnCanvas")).toBe(
      "Refresh data, then try showing this item on the canvas.",
    );
    expect(french.t("common:disabledReasons.itemUnavailableOnCanvas")).toBe(
      "Actualisez les données, puis réessayez d’afficher cet élément sur le canevas.",
    );
    expect(arabic.t("common:disabledReasons.itemUnavailableOnCanvas")).toBe(
      "حدّث البيانات، ثم حاول إظهار هذا العنصر على اللوحة.",
    );
  });

  it("resolves create-document dialog copy and linked-document interpolation in each language", () => {
    const keys = [
      "documents:createDialog.accessibility.backToFeature",
      "documents:createDialog.actions.create",
      "documents:createDialog.descriptions.featureStage",
      "documents:createDialog.documentTypes.adr",
      "documents:createDialog.emptyStates.createFeatureTag",
      "documents:createDialog.errors.pathCollision",
      "documents:createDialog.hints.reference",
      "documents:createDialog.labels.feature",
      "documents:createDialog.placeholders.documentTitle",
      "documents:createDialog.stages.feature",
      "documents:createDialog.states.coverageUnavailable",
      "documents:createDialog.titles.feature",
      "documents:createDialog.validation.completeRequiredFields",
    ] as const satisfies readonly MessageKey[];
    const runtimes = [
      createTestLocalizationRuntime(sourceLocale),
      createTestLocalizationRuntime(ltrTestLocale),
      createTestLocalizationRuntime(rtlTestLocale),
    ] as const;

    for (const key of keys) {
      expect(new Set(runtimes.map((runtime) => runtime.t(key))).size, key).toBe(3);
    }

    const linkedDocument = "Customer roadmap";
    expect(
      runtimes.map((runtime) =>
        runtime.t("documents:createDialog.accessibility.removeLinkedDocument", {
          document: linkedDocument,
        }),
      ),
    ).toEqual([
      "Remove Customer roadmap",
      "Supprimer Customer roadmap",
      "إزالة Customer roadmap",
    ]);
  });

  it("resolves stage-menu actions and recovery copy independently in each language", () => {
    const keys = [
      "graph:actions.addItemToWorkingSet",
      "graph:actions.pinItem",
      "graph:actions.showRelatedItem",
      "graph:actions.showStartingItem",
      "graph:actions.unpinItem",
      "graph:disabledReasons.chooseConnectionWithSummary",
      "graph:disabledReasons.chooseItemWithTitle",
      "graph:disabledReasons.relatedItemUnavailable",
      "graph:disabledReasons.startingItemUnavailable",
    ] as const satisfies readonly MessageKey[];
    const english = createTestLocalizationRuntime(sourceLocale);
    const french = createTestLocalizationRuntime(ltrTestLocale);
    const arabic = createTestLocalizationRuntime(rtlTestLocale);

    for (const key of keys) {
      const englishMessage = english.t(key);
      const frenchMessage = french.t(key);
      const arabicMessage = arabic.t(key);
      expect(frenchMessage, key).not.toBe(englishMessage);
      expect(arabicMessage, key).not.toBe(englishMessage);
      expect(arabicMessage, key).not.toBe(frenchMessage);
    }
  });

  it("resolves history and pull-request actions independently in each language", () => {
    const keys = [
      "timeline:actions.viewProjectAtVersion",
      "timeline:disabledReasons.chooseProject",
      "timeline:disabledReasons.refreshHistory",
      "timeline:disabledReasons.switchToDocumentsForHistory",
      "projects:actions.openPullRequest",
      "projects:disabledReasons.refreshProjectForPullRequest",
    ] as const satisfies readonly MessageKey[];
    const runtimes = [
      createTestLocalizationRuntime(sourceLocale),
      createTestLocalizationRuntime(ltrTestLocale),
      createTestLocalizationRuntime(rtlTestLocale),
    ] as const;

    for (const key of keys) {
      const messages = runtimes.map((runtime) => runtime.t(key));
      expect(new Set(messages).size, key).toBe(3);
    }
  });
});
