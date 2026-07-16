import { MESSAGE_KEYS, type MessageKey } from "../platform/localization/message";
import { DOCUMENT_VIEWER_MESSAGE_POLICY } from "./messagePolicy.documentViewer";
import { FILTER_MESSAGE_POLICY } from "./messagePolicy.filters";
import { NODE_INTERIOR_MESSAGE_POLICY } from "./messagePolicy.nodeInterior";
import { HOVER_MESSAGE_POLICY } from "./messagePolicy.hover";
import { GRAPH_CONTROLS_MESSAGE_POLICY } from "./messagePolicy.graphControls";
import { LANGUAGE_DISPLAY_MESSAGE_POLICY } from "./messagePolicy.languageDisplay";
import { SEARCH_MAINTENANCE_MESSAGE_POLICY } from "./messagePolicy.searchMaintenance";
import { THREE_LAB_MESSAGE_POLICY } from "./messagePolicy.threeLab";
import { SHELL_MESSAGE_POLICY } from "./messagePolicy.shell";
import { AGENT_MESSAGE_POLICY } from "./messagePolicy.agent";

export type MessageRole =
  | "action"
  | "destructive-action"
  | "label"
  | "proper-name"
  | "status"
  | "error-title"
  | "error-message"
  | "disabled-reason"
  | "description"
  | "accessibility"
  | "confirmation";

export const APPROVED_UI_TERMS = [
  "GitHub",
  "Markdown",
  "JSON",
  "YAML",
  "URLs",
  "URL",
  "macOS",
  "Windows",
  "Linux",
  "Git",
] as const;

export type ApprovedUiTerm = (typeof APPROVED_UI_TERMS)[number];

export interface MessagePolicyEntry {
  readonly role: MessageRole;
  readonly allowedTerms?: readonly ApprovedUiTerm[];
}

export const ENGLISH_MESSAGE_POLICY = {
  ...SHELL_MESSAGE_POLICY,
  ...FILTER_MESSAGE_POLICY,
  ...NODE_INTERIOR_MESSAGE_POLICY,
  ...HOVER_MESSAGE_POLICY,
  ...SEARCH_MAINTENANCE_MESSAGE_POLICY,
  ...AGENT_MESSAGE_POLICY,
  "common:accessibility.actionsForItem": { role: "accessibility" },
  "common:accessibility.actionsMenu": { role: "accessibility" },
  "common:accessibility.back": { role: "accessibility" },
  "common:accessibility.confirmAction": { role: "accessibility" },
  "common:accessibility.recordShortcut": { role: "accessibility" },
  "common:accessibility.resizeActivityPanel": { role: "accessibility" },
  "common:accessibility.resizeAgentPanel": { role: "accessibility" },
  "common:accessibility.resizeNavigationPanel": { role: "accessibility" },
  "common:accessibility.resizeTimeline": { role: "accessibility" },
  "common:accessibility.resetShortcut": { role: "accessibility" },
  "common:accessibility.skipToContent": { role: "accessibility" },
  "common:accessibility.switchWorkspace": { role: "accessibility" },
  "common:actions.cancel": { role: "action" },
  "common:actions.close": { role: "action" },
  "common:actions.collapseNavigationPanel": { role: "action" },
  "common:actions.copy": { role: "action" },
  "common:actions.copyBranchName": { role: "action" },
  "common:actions.copyCategoryName": { role: "action" },
  "common:actions.copyCommitHash": { role: "action" },
  "common:actions.copyCommitMessage": { role: "action" },
  "common:actions.copyDocumentName": { role: "action" },
  "common:actions.copyFeatureTag": { role: "action" },
  "common:actions.copyPath": { role: "action" },
  "common:actions.copyPullRequestLink": { role: "action" },
  "common:actions.copyPullRequestNumber": { role: "action" },
  "common:actions.copyShortCommitHash": { role: "action" },
  "common:actions.copySummary": { role: "action" },
  "common:actions.copyTitle": { role: "action" },
  "common:actions.disableFollowMode": { role: "action" },
  "common:actions.enableFollowMode": { role: "action" },
  "common:actions.expandNavigationPanel": { role: "action" },
  "common:actions.hideActivityPanel": { role: "action" },
  "common:actions.hideApprovals": { role: "action" },
  "common:actions.hideGraph": { role: "action" },
  "common:actions.hideNavigationPanel": { role: "action" },
  "common:actions.hideProjectHealth": { role: "action" },
  "common:actions.hideSearchStatus": { role: "action" },
  "common:actions.hideSystemStatus": { role: "action" },
  "common:actions.hideTimeline": { role: "action" },
  "common:actions.moveToNextPanel": { role: "action" },
  "common:actions.moveToPreviousPanel": { role: "action" },
  "common:actions.open": { role: "action" },
  "common:actions.openCommandPalette": { role: "action" },
  "common:actions.openFilters": { role: "action" },
  "common:actions.openInEditor": { role: "action" },
  "common:actions.openSettings": { role: "action" },
  "common:actions.refreshData": { role: "action" },
  "common:actions.reloadPage": { role: "action" },
  "common:actions.reset": { role: "action" },
  "common:actions.resetLayout": { role: "action" },
  "common:actions.retry": { role: "action" },
  "common:actions.searchDocumentsAndCode": { role: "action" },
  "common:actions.showActivityPanel": { role: "action" },
  "common:actions.showApprovals": { role: "action" },
  "common:actions.showChanges": { role: "action" },
  "common:actions.showGraph": { role: "action" },
  "common:actions.showNavigationPanel": { role: "action" },
  "common:actions.showOrHideGraph": { role: "action" },
  "common:actions.showInFileManager": { role: "action" },
  "common:actions.showKeyboardShortcuts": { role: "action" },
  "common:actions.showOnCanvas": { role: "action" },
  "common:actions.showProjectHealth": { role: "action" },
  "common:actions.showSearchStatus": { role: "action" },
  "common:actions.showStatus": { role: "action" },
  "common:actions.showSystemStatus": { role: "action" },
  "common:actions.showTimeline": { role: "action" },
  "common:activityTabs.changes": { role: "label" },
  "common:activityTabs.status": { role: "label" },
  "common:commandFamilies.editing": { role: "label" },
  "common:commandFamilies.filters": { role: "label" },
  "common:commandFamilies.focus": { role: "label" },
  "common:commandFamilies.general": { role: "label" },
  "common:commandFamilies.help": { role: "label" },
  "common:commandFamilies.layout": { role: "label" },
  "common:commandFamilies.navigation": { role: "label" },
  "common:commandFamilies.refresh": { role: "label" },
  "common:commandFamilies.search": { role: "label" },
  "common:commandFamilies.searchMaintenance": { role: "label" },
  "common:commandFamilies.settings": { role: "label" },
  "common:commandFamilies.workspaceMaintenance": { role: "label" },
  "common:commandPalette.dialogLabel": { role: "accessibility" },
  "common:commandPalette.inputPlaceholder": { role: "label" },
  "common:commandPalette.listboxLabel": { role: "accessibility" },
  "common:commandPalette.noMatches": { role: "status" },
  "common:commandPalette.loading": { role: "status" },
  "common:commandPalette.selectionAnnouncement": { role: "accessibility" },
  "common:commandPalette.footer.navigate": { role: "label" },
  "common:commandPalette.footer.open": { role: "label" },
  "common:commandPalette.footer.close": { role: "label" },
  "common:searchPalette.accessibility.dialog": { role: "accessibility" },
  "common:searchPalette.accessibility.results": { role: "accessibility" },
  "common:searchPalette.accessibility.scope": { role: "accessibility" },
  "common:searchPalette.accessibility.selectableResult": { role: "accessibility" },
  "common:searchPalette.accessibility.unavailableResult": { role: "accessibility" },
  "common:searchPalette.actions.cancel": { role: "action" },
  "common:searchPalette.actions.close": { role: "label" },
  "common:searchPalette.actions.move": { role: "label" },
  "common:searchPalette.actions.open": { role: "label" },
  "common:searchPalette.actions.previousNext": { role: "label" },
  "common:searchPalette.counts.results": { role: "status" },
  "common:searchPalette.labels.change": { role: "label" },
  "common:searchPalette.labels.code": { role: "label" },
  "common:searchPalette.labels.document": { role: "label" },
  "common:searchPalette.labels.result": { role: "label" },
  "common:searchPalette.labels.untitledResult": { role: "label" },
  "common:searchPalette.placeholders.query": { role: "label" },
  "common:searchPalette.preview.unavailable": { role: "status" },
  "common:searchPalette.scopes.all": { role: "label" },
  "common:searchPalette.scopes.code": { role: "label" },
  "common:searchPalette.scopes.documents": { role: "label" },
  "common:searchPalette.states.degraded": { role: "status" },
  "common:searchPalette.states.failed": { role: "error-message" },
  "common:searchPalette.states.idle": { role: "status" },
  "common:searchPalette.states.incomplete": { role: "status" },
  "common:searchPalette.states.noMatches": { role: "status" },
  "common:searchPalette.states.searching": { role: "status" },
  "common:controlPanels.labels.search": { role: "label" },
  "common:controlPanels.labels.projectHealth": { role: "label" },
  "common:controlPanels.labels.systemStatus": { role: "label" },
  "common:controlPanels.labels.approvals": { role: "label" },
  "common:controlPanels.actions.showSearch": { role: "action" },
  "common:controlPanels.actions.hideSearch": { role: "action" },
  "common:controlPanels.actions.showProjectHealth": { role: "action" },
  "common:controlPanels.actions.hideProjectHealth": { role: "action" },
  "common:controlPanels.actions.showSystemStatus": { role: "action" },
  "common:controlPanels.actions.hideSystemStatus": { role: "action" },
  "common:controlPanels.actions.showApprovals": { role: "action" },
  "common:controlPanels.actions.hideApprovals": { role: "action" },
  "common:controlPanels.unavailableTitles.search": { role: "error-title" },
  "common:controlPanels.unavailableTitles.projectHealth": {
    role: "error-title",
  },
  "common:controlPanels.unavailableTitles.systemStatus": { role: "error-title" },
  "common:controlPanels.unavailableTitles.approvals": { role: "error-title" },
  "common:controlPanels.accessibility.group": { role: "accessibility" },
  "common:controlPanels.accessibility.panelStatus": { role: "accessibility" },
  "common:controlPanels.tones.workingNormally": { role: "status" },
  "common:controlPanels.tones.needsAttention": { role: "status" },
  "common:controlPanels.tones.unavailable": { role: "status" },
  "common:controlPanels.tones.checking": { role: "status" },
  "common:disabledReasons.actionUnavailable": { role: "disabled-reason" },
  "common:disabledReasons.itemUnavailableOnCanvas": {
    role: "disabled-reason",
  },
  "common:disabledReasons.currentVersionRequired": { role: "disabled-reason" },
  "common:disabledReasons.desktopEditorRequired": { role: "disabled-reason" },
  "common:disabledReasons.desktopFileManagerRequired": {
    role: "disabled-reason",
  },
  "common:disabledReasons.selectItemToOpen": { role: "disabled-reason" },
  "common:feedback.actionUnavailable": { role: "error-message" },
  "common:feedback.copyFailed": { role: "error-message" },
  "common:feedback.copySucceeded": { role: "status" },
  "common:destructiveActions.discardChanges": { role: "destructive-action" },
  "common:shortcutDialog.description": { role: "description" },
  "common:shortcutDialog.title": { role: "label" },
  "common:shortcutSettings.conflict": { role: "error-message" },
  "common:shortcutSettings.empty": { role: "status" },
  "common:shortcutSettings.recording": { role: "status" },
  "common:shortcutGroups.general": { role: "label" },
  "common:shortcutGroups.graph": { role: "label" },
  "common:shortcutGroups.navigation": { role: "label" },
  "common:shortcutGroups.window": { role: "label" },
  "common:keycaps.alt": { role: "label" },
  "common:keycaps.arrowDown": { role: "label" },
  "common:keycaps.arrowLeft": { role: "label" },
  "common:keycaps.arrowRight": { role: "label" },
  "common:keycaps.arrowUp": { role: "label" },
  "common:keycaps.backspace": { role: "label" },
  "common:keycaps.control": { role: "label" },
  "common:keycaps.delete": { role: "label" },
  "common:keycaps.end": { role: "label" },
  "common:keycaps.enter": { role: "label" },
  "common:keycaps.escape": { role: "label" },
  "common:keycaps.home": { role: "label" },
  "common:keycaps.insert": { role: "label" },
  "common:keycaps.pageDown": { role: "label" },
  "common:keycaps.pageUp": { role: "label" },
  "common:keycaps.shift": { role: "label" },
  "common:keycaps.space": { role: "label" },
  "common:keycaps.tab": { role: "label" },
  "common:palette.commandCount": { role: "status" },
  "common:statuses.noActionsAvailable": { role: "status" },
  "documents:accessibility.addDocumentToFeature": { role: "accessibility" },
  "documents:accessibility.browserView": { role: "accessibility" },
  "documents:accessibility.decisionAccepted": { role: "accessibility" },
  "documents:accessibility.decisionDeprecated": { role: "accessibility" },
  "documents:accessibility.decisionProposed": { role: "accessibility" },
  "documents:accessibility.decisionRejected": { role: "accessibility" },
  "documents:accessibility.decisionSuperseded": { role: "accessibility" },
  "documents:accessibility.planComplete": { role: "accessibility" },
  "documents:accessibility.planInProgress": { role: "accessibility" },
  "documents:accessibility.planNotStarted": { role: "accessibility" },
  "documents:accessibility.treeBrowser": { role: "accessibility" },
  "documents:accessibility.switchReadingAndEditingShortcut": {
    role: "accessibility",
  },
  "documents:accessibility.treeOptionsSortedByCreationDate": {
    role: "accessibility",
  },
  "documents:accessibility.treeOptionsSortedByDocumentCount": {
    role: "accessibility",
  },
  "documents:accessibility.treeOptionsSortedByEditDate": {
    role: "accessibility",
  },
  "documents:accessibility.treeOptionsSortedByLatestActivity": {
    role: "accessibility",
  },
  "documents:accessibility.treeOptionsSortedByLength": {
    role: "accessibility",
  },
  "documents:accessibility.treeOptionsSortedByName": {
    role: "accessibility",
  },
  "documents:accessibility.treeOptionsSortedByWorkspaceShare": {
    role: "accessibility",
  },
  "documents:codeTree.accessibility.browser": { role: "accessibility" },
  "documents:codeTree.accessibility.linkedToMap": { role: "accessibility" },
  "documents:codeTree.errors.childUnavailable": { role: "error-message" },
  "documents:codeTree.errors.unavailable": { role: "error-message" },
  "documents:codeTree.states.childLoading": { role: "status" },
  "documents:codeTree.states.degraded": { role: "status" },
  "documents:codeTree.states.empty": { role: "status" },
  "documents:codeTree.states.loading": { role: "status" },
  "documents:codeTree.states.truncated": { role: "status" },
  "documents:codeTree.states.truncatedUnknown": { role: "status" },
  "documents:documentSearch.accessibility.dialog": { role: "accessibility" },
  "documents:documentSearch.accessibility.results": { role: "accessibility" },
  "documents:documentSearch.counts.documents": { role: "status" },
  "documents:documentSearch.placeholders.query": { role: "label" },
  "documents:documentSearch.states.idle": { role: "status" },
  "documents:documentSearch.states.noMatches": { role: "status" },
  "documents:documentSearch.states.searching": { role: "status" },
  "documents:documentSearch.states.unavailable": { role: "error-message" },
  "documents:confirmations.discardUnsavedChanges.body": { role: "confirmation" },
  "documents:confirmations.discardUnsavedChanges.title": { role: "confirmation" },
  "documents:editor.accessibility.formattingToolbar": { role: "accessibility" },
  "documents:editor.actions.bold": { role: "action" },
  "documents:editor.actions.bulletedList": { role: "action" },
  "documents:editor.actions.heading": { role: "action" },
  "documents:editor.actions.inlineCode": { role: "action" },
  "documents:editor.actions.italic": { role: "action" },
  "documents:editor.actions.link": { role: "action" },
  "documents:editor.actions.linkToDocument": { role: "action" },
  "documents:editor.actions.numberedList": { role: "action" },
  "documents:editor.actions.quote": { role: "action" },
  ...DOCUMENT_VIEWER_MESSAGE_POLICY,
  ...GRAPH_CONTROLS_MESSAGE_POLICY,
  ...THREE_LAB_MESSAGE_POLICY,
  ...LANGUAGE_DISPLAY_MESSAGE_POLICY,
  "documents:actions.addComment": { role: "action" },
  "documents:actions.addToFeature": { role: "action" },
  "documents:actions.browseDocuments": { role: "action" },
  "documents:actions.browseFiles": { role: "action" },
  "documents:actions.closeAllDocuments": { role: "action" },
  "documents:actions.closeDocument": { role: "action" },
  "documents:actions.closeOtherDocuments": { role: "action" },
  "documents:actions.clearFilter": { role: "action" },
  "documents:actions.closeActiveTab": { role: "action" },
  "documents:actions.collapseCategory": { role: "action" },
  "documents:actions.collapseTree": { role: "action" },
  "documents:actions.copyLink": { role: "action" },
  "documents:actions.expandTree": { role: "action" },
  "documents:actions.expandCategory": { role: "action" },
  "documents:actions.findByName": { role: "action" },
  "documents:actions.finishEditing": { role: "action" },
  "documents:actions.focusFilter": { role: "action" },
  "documents:actions.keepDocumentOpen": { role: "action" },
  "documents:actions.keepTabOpen": { role: "action" },
  "documents:actions.linkToSelectedDocument": { role: "action" },
  "documents:actions.nextTab": { role: "action" },
  "documents:actions.openComments": { role: "action" },
  "documents:actions.previousTab": { role: "action" },
  "documents:actions.resetFilters": { role: "action" },
  "documents:actions.resetSorting": { role: "action" },
  "documents:actions.reloadDocument": { role: "action" },
  "documents:actions.save": { role: "action" },
  "documents:actions.sortByCreationDate": { role: "action" },
  "documents:actions.sortByDocumentCount": { role: "action" },
  "documents:actions.sortByEditDate": { role: "action" },
  "documents:actions.sortByLatestActivity": { role: "action" },
  "documents:actions.sortByLength": { role: "action" },
  "documents:actions.sortByName": { role: "action" },
  "documents:actions.sortByWorkspaceShare": { role: "action" },
  "documents:actions.showOrHideFilterOptions": { role: "action" },
  "documents:actions.filterByDocumentType": { role: "action" },
  "documents:actions.showOrHideChanges": { role: "action" },
  "documents:actions.switchReadingAndEditing": { role: "action" },
  "documents:actions.switchView": { role: "action" },
  "documents:browserModes.documents": { role: "label" },
  "documents:browserModes.files": { role: "label" },
  "documents:categories.code": { role: "label", allowedTerms: [] },
  "documents:createDialog.accessibility.addLinkedDocument": {
    role: "accessibility",
  },
  "documents:createDialog.accessibility.backToFeature": {
    role: "accessibility",
  },
  "documents:createDialog.accessibility.documentType": {
    role: "accessibility",
  },
  "documents:createDialog.accessibility.feature": { role: "accessibility" },
  "documents:createDialog.accessibility.linkedDocuments": {
    role: "accessibility",
  },
  "documents:createDialog.accessibility.pipelineCoverage": {
    role: "accessibility",
  },
  "documents:createDialog.accessibility.removeLinkedDocument": {
    role: "accessibility",
  },
  "documents:createDialog.accessibility.title": { role: "accessibility" },
  "documents:createDialog.actions.back": { role: "action" },
  "documents:createDialog.actions.continue": { role: "action" },
  "documents:createDialog.actions.create": { role: "action" },
  "documents:createDialog.actions.creating": { role: "status" },
  "documents:createDialog.descriptions.documentStage": {
    role: "description",
  },
  "documents:createDialog.descriptions.featureStage": {
    role: "description",
  },
  "documents:createDialog.documentTypes.adr": { role: "label" },
  "documents:createDialog.documentTypes.audit": { role: "label" },
  "documents:createDialog.documentTypes.document": { role: "label" },
  "documents:createDialog.documentTypes.exec": { role: "label" },
  "documents:createDialog.documentTypes.plan": { role: "label" },
  "documents:createDialog.documentTypes.reference": { role: "label" },
  "documents:createDialog.documentTypes.research": { role: "label" },
  "documents:createDialog.emptyStates.createFeatureTag": { role: "status" },
  "documents:createDialog.emptyStates.noMatchingDocuments": { role: "status" },
  "documents:createDialog.errors.createFailed": { role: "error-message" },
  "documents:createDialog.errors.inFlight": { role: "error-message" },
  "documents:createDialog.errors.pathCollision": { role: "error-message" },
  "documents:createDialog.errors.projectChanged": { role: "error-message" },
  "documents:createDialog.errors.scopeChanged": { role: "error-message" },
  "documents:createDialog.hints.adr": { role: "description" },
  "documents:createDialog.hints.audit": { role: "description" },
  "documents:createDialog.hints.notAvailable": { role: "status" },
  "documents:createDialog.hints.plan": { role: "description" },
  "documents:createDialog.hints.reference": { role: "description" },
  "documents:createDialog.hints.requiresDecision": {
    role: "disabled-reason",
  },
  "documents:createDialog.hints.requiresResearchOrReference": {
    role: "disabled-reason",
  },
  "documents:createDialog.hints.research": { role: "description" },
  "documents:createDialog.labels.documentType": { role: "label" },
  "documents:createDialog.labels.feature": { role: "label" },
  "documents:createDialog.labels.inThisFeature": { role: "label" },
  "documents:createDialog.labels.linkedDocuments": { role: "label" },
  "documents:createDialog.labels.title": { role: "label" },
  "documents:createDialog.placeholders.addLinkedDocument": { role: "label" },
  "documents:createDialog.placeholders.documentTitle": { role: "label" },
  "documents:createDialog.placeholders.featureTag": { role: "label" },
  "documents:createDialog.stages.document": { role: "label" },
  "documents:createDialog.stages.feature": { role: "label" },
  "documents:createDialog.states.checkingCoverage": { role: "status" },
  "documents:createDialog.states.chooseFeatureForCoverage": {
    role: "disabled-reason",
  },
  "documents:createDialog.states.coverageUnavailable": {
    role: "error-message",
  },
  "documents:createDialog.states.emptyFeature": { role: "description" },
  "documents:createDialog.states.nextStep": { role: "status" },
  "documents:createDialog.states.notYet": { role: "status" },
  "documents:createDialog.states.present": { role: "status" },
  "documents:createDialog.states.selected": { role: "status" },
  "documents:createDialog.titles.document": { role: "label" },
  "documents:createDialog.titles.feature": { role: "label" },
  "documents:createDialog.validation.chooseAvailableDocumentType": {
    role: "disabled-reason",
  },
  "documents:createDialog.validation.chooseDocumentType": {
    role: "disabled-reason",
  },
  "documents:createDialog.validation.chooseFeature": {
    role: "disabled-reason",
  },
  "documents:createDialog.validation.completeRequiredFields": {
    role: "disabled-reason",
  },
  "documents:createDialog.validation.requiresDecision": {
    role: "disabled-reason",
  },
  "documents:createDialog.validation.requiresResearchOrReference": {
    role: "disabled-reason",
  },
  "documents:documentTypes.adr": { role: "label" },
  "documents:documentTypes.audit": { role: "label" },
  "documents:documentTypes.exec": { role: "label" },
  "documents:documentTypes.plan": { role: "label" },
  "documents:documentTypes.reference": { role: "label" },
  "documents:documentTypes.research": { role: "label" },
  "documents:reviewStation.accessibility.loadingQueue": {
    role: "accessibility",
  },
  "documents:reviewStation.actions.hideChanges": { role: "action" },
  "documents:reviewStation.actions.showChanges": { role: "action" },
  "documents:guardedActions.reviewStationApproveProposal": { role: "action" },
  "documents:guardedActions.reviewStationApplyChanges": { role: "action" },
  "documents:guardedActions.reviewStationPrepareRollback": { role: "action" },
  "documents:guardedActions.moveCommentToThisSection": { role: "action" },
  "documents:reviewStation.actions.submitForReview": { role: "action" },
  "documents:destructiveActions.reviewStationRejectProposal": {
    role: "destructive-action",
  },
  "documents:destructiveActions.deleteComment": { role: "destructive-action" },
  "documents:reviewStation.confirmations.approve.title": {
    role: "confirmation",
  },
  "documents:reviewStation.confirmations.approve.body": {
    role: "confirmation",
  },
  "documents:reviewStation.confirmations.apply.title": {
    role: "confirmation",
  },
  "documents:reviewStation.confirmations.apply.body": { role: "confirmation" },
  "documents:reviewStation.confirmations.reject.title": {
    role: "confirmation",
  },
  "documents:reviewStation.confirmations.reject.body": {
    role: "confirmation",
  },
  "documents:reviewStation.confirmations.rollback.title": {
    role: "confirmation",
  },
  "documents:reviewStation.confirmations.rollback.body": {
    role: "confirmation",
  },
  "documents:reviewStation.statuses.applied": { role: "status" },
  "documents:reviewStation.statuses.applying": { role: "status" },
  "documents:reviewStation.statuses.approved": { role: "status" },
  "documents:reviewStation.statuses.cancelled": { role: "status" },
  "documents:reviewStation.statuses.compensationRequired": { role: "status" },
  "documents:reviewStation.statuses.conflicted": { role: "status" },
  "documents:reviewStation.statuses.draft": { role: "status" },
  "documents:reviewStation.statuses.failed": { role: "status" },
  "documents:reviewStation.statuses.generating": { role: "status" },
  "documents:reviewStation.statuses.needsReview": { role: "status" },
  "documents:reviewStation.statuses.partiallyApplied": { role: "status" },
  "documents:reviewStation.statuses.proposed": { role: "status" },
  "documents:reviewStation.statuses.rejected": { role: "status" },
  "documents:reviewStation.statuses.rollbackProposed": { role: "status" },
  "documents:reviewStation.statuses.superseded": { role: "status" },
  "documents:reviewStation.statuses.unknown": { role: "status" },
  "documents:reviewStation.policy.assistedHumanApproval": { role: "label" },
  "documents:reviewStation.policy.assistedSystemApproval": { role: "label" },
  "documents:reviewStation.policy.autonomousHumanApproval": { role: "label" },
  "documents:reviewStation.policy.autonomousSystemApproval": { role: "label" },
  "documents:reviewStation.policy.manualHumanApproval": { role: "label" },
  "documents:reviewStation.policy.manualSystemApproval": { role: "label" },
  "documents:reviewStation.policy.unavailable": { role: "label" },
  "documents:reviewStation.authorKinds.agent": { role: "label" },
  "documents:reviewStation.authorKinds.human": { role: "label" },
  "documents:reviewStation.authorKinds.system": { role: "label" },
  "documents:reviewStation.authorKinds.toolExecutor": { role: "label" },
  "documents:reviewStation.authorKinds.unknown": { role: "label" },
  "documents:reviewStation.validation.invalid": { role: "status" },
  "documents:reviewStation.validation.stale": { role: "status" },
  "documents:reviewStation.validation.unavailable": { role: "status" },
  "documents:reviewStation.validation.valid": { role: "status" },
  "documents:reviewStation.validation.validWithWarnings": { role: "status" },
  "documents:reviewStation.stale.policyChanged": { role: "status" },
  "documents:reviewStation.stale.reviewChanged": { role: "status" },
  "documents:reviewStation.counts.acknowledgements": { role: "label" },
  "documents:reviewStation.counts.changes": { role: "label" },
  "documents:reviewStation.disabledReasons.actionInProgress": {
    role: "disabled-reason",
  },
  "documents:reviewStation.disabledReasons.actionUnavailable": {
    role: "disabled-reason",
  },
  "documents:reviewStation.disabledReasons.rollbackUnavailable": {
    role: "disabled-reason",
  },
  "documents:reviewStation.feedback.actionAccepted": { role: "status" },
  "documents:reviewStation.feedback.actionNotAllowed": {
    role: "error-message",
  },
  "documents:reviewStation.feedback.rollbackUnavailable": {
    role: "error-message",
  },
  "documents:reviewStation.feedback.reviewChanged": { role: "error-message" },
  "documents:reviewStation.feedback.reviewerUnavailable": {
    role: "error-message",
  },
  "documents:reviewStation.errors.actionFailed": { role: "error-message" },
  "documents:reviewStation.errors.conflict": { role: "error-message" },
  "documents:reviewStation.errors.queueUnavailable": { role: "error-message" },
  "documents:reviewStation.states.appliedAutomatically": { role: "status" },
  "documents:reviewStation.states.empty": { role: "status" },
  "documents:reviewStation.states.informationMayBeOutOfDate": {
    role: "error-message",
  },
  "documents:reviewStation.states.loading": { role: "status" },
  "documents:reviewStation.states.moreAppliedChanges": { role: "status" },
  "documents:reviewStation.states.moreProposals": { role: "status" },
  "documents:reviewStation.states.untitledProposal": { role: "status" },
  "documents:reviewStation.sections.appliedAutomatically": { role: "label" },
  "documents:reviewStation.labels.actionUnavailable": { role: "label" },
  "documents:disabledReasons.chooseTemporaryTab": { role: "disabled-reason" },
  "documents:disabledReasons.copyChangesBeforeReopening": {
    role: "disabled-reason",
  },
  "documents:disabledReasons.openForEditing": { role: "disabled-reason" },
  "documents:disabledReasons.openDocument": { role: "disabled-reason" },
  "documents:disabledReasons.openAnotherDocument": { role: "disabled-reason" },
  "documents:disabledReasons.selectDifferentDocument": {
    role: "disabled-reason",
  },
  "documents:disabledReasons.selectDocument": { role: "disabled-reason" },
  "documents:disabledReasons.tryAfterSaving": { role: "disabled-reason" },
  "documents:disabledReasons.updateBeforeSaving": { role: "disabled-reason" },
  "documents:shortcutGroups.documents": { role: "label" },
  "documents:feedback.alreadyLinked": { role: "status" },
  "documents:feedback.linkConflict": { role: "error-message" },
  "documents:feedback.linkFailed": { role: "error-message" },
  "documents:feedback.linkInProgress": { role: "status" },
  "documents:feedback.linkSucceeded": { role: "status" },
  "documents:tree.created": { role: "label" },
  "documents:tree.decisionStatusAccepted": { role: "label" },
  "documents:tree.decisionStatusDeprecated": { role: "label" },
  "documents:tree.decisionStatusProposed": { role: "label" },
  "documents:tree.decisionStatusRejected": { role: "label" },
  "documents:tree.decisionStatusSuperseded": { role: "label" },
  "documents:tree.degraded": { role: "status" },
  "documents:tree.lastEdited": { role: "label" },
  "documents:tree.emptyWorktree": { role: "status" },
  "documents:tree.loading": { role: "status" },
  "documents:tree.noFilterMatches": { role: "status" },
  "documents:tree.noFilterMatchesYet": { role: "status" },
  "documents:tree.partialAnnouncement": { role: "status" },
  "documents:tree.partialCount": { role: "status" },
  "documents:tree.planProgress": { role: "status" },
  "documents:tree.sizeSummary": { role: "label" },
  "documents:tree.unavailable": { role: "error-message" },
  "documents:tree.updated": { role: "label" },
  "documents:tree.vaultBrowser": { role: "accessibility" },
  "documents:tree.wordCount": { role: "label" },
  "documents:tree.weightBelowThreshold": { role: "label" },
  "documents:labels.document": { role: "label" },
  "documents:labels.vault": { role: "label" },
  "documents:sortOptions.creationDate": { role: "label" },
  "documents:sortOptions.documentCount": { role: "label" },
  "documents:sortOptions.editDate": { role: "label" },
  "documents:sortOptions.latestActivity": { role: "label" },
  "documents:sortOptions.length": { role: "label" },
  "documents:sortOptions.name": { role: "label" },
  "documents:sortOptions.workspaceShare": { role: "label" },
  "documents:shortcutGroups.editing": { role: "label" },
  "errors:fallback.contentUnavailable": { role: "error-message" },
  "errors:unexpectedApplication.message": { role: "error-message" },
  "errors:unexpectedApplication.title": { role: "error-title" },
  "errors:unexpectedSection.message": { role: "error-message" },
  "errors:unexpectedSection.title": { role: "error-title" },
  "features:actions.collapse": { role: "action" },
  "features:actions.expand": { role: "action" },
  "features:actions.moveToNextFeature": { role: "action" },
  "features:actions.moveToPreviousFeature": { role: "action" },
  "features:actions.filterByFeature": { role: "action" },
  "features:confirmations.archive.body": { role: "confirmation" },
  "features:confirmations.archive.title": { role: "label" },
  "features:confirmations.repair.body": { role: "confirmation" },
  "features:confirmations.repair.title": { role: "label" },
  "features:destructiveActions.archive": { role: "destructive-action" },
  "features:disabledReasons.selectFeature": { role: "disabled-reason" },
  "features:feedback.archiveRejected": { role: "error-message" },
  "features:feedback.archiveSucceeded": { role: "status" },
  "features:feedback.archiveUnavailable": { role: "error-message" },
  "features:feedback.repairRejected": { role: "error-message" },
  "features:feedback.repairSucceeded": { role: "status" },
  "features:feedback.repairUnavailable": { role: "error-message" },
  "features:guardedActions.repair": { role: "action" },
  "features:labels.feature": { role: "label" },
  "graph:canvas.emptyStates.noFilterMatches": { role: "status" },
  "graph:canvas.errors.unavailable": { role: "error-message" },
  "graph:canvas.errors.partialUnavailable": { role: "error-message" },
  "graph:canvas.errors.graphicsTitle": { role: "error-title" },
  "graph:canvas.errors.graphicsMessage": { role: "error-message" },
  "graph:canvas.states.loading": { role: "status" },
  "graph:canvas.states.restoring": { role: "status" },
  "graph:canvas.states.loadingDetails": { role: "status" },
  "graph:canvas.states.loadingDocumentLinks": { role: "status" },
  "graph:canvas.states.truncated": { role: "status" },
  "graph:canvas.states.refreshingDocumentLinks": { role: "status" },
  "graph:canvas.states.refreshing": { role: "status" },
  "graph:accessibility.selectedItem": { role: "accessibility" },
  "graph:accessibility.selectedItemGeneric": { role: "accessibility" },
  "graph:accessibility.workingSet": { role: "accessibility" },
  "graph:accessibility.workingSetCount": { role: "accessibility" },
  "graph:accessibility.hiddenByActiveFilter": { role: "accessibility" },
  "graph:accessibility.namedWorkingSetItemHidden": { role: "accessibility" },
  "graph:accessibility.workingSetItemHidden": { role: "accessibility" },
  "graph:actions.addItemToWorkingSet": { role: "action" },
  "graph:actions.addSelectedItemToWorkingSet": { role: "action" },
  "graph:actions.clearSelection": { role: "action" },
  "graph:actions.clearWorkingSet": { role: "action" },
  "graph:actions.expandFocusedItem": { role: "action" },
  "graph:actions.fitToView": { role: "action" },
  "graph:actions.moveToNextConnectedItem": { role: "action" },
  "graph:actions.moveToPreviousConnectedItem": { role: "action" },
  "graph:actions.openFocusedItem": { role: "action" },
  "graph:actions.pauseMovement": { role: "action" },
  "graph:actions.pinItem": { role: "action" },
  "graph:actions.resetSettings": { role: "action" },
  "graph:actions.resetView": { role: "action" },
  "graph:actions.removeItemFromWorkingSet": { role: "action" },
  "graph:actions.removeNamedItemFromWorkingSet": { role: "action" },
  "graph:actions.removeLastItemFromWorkingSet": { role: "action" },
  "graph:actions.resumeMovement": { role: "action" },
  "graph:actions.showRelatedItem": { role: "action" },
  "graph:actions.showStartingItem": { role: "action" },
  "graph:actions.unpinItem": { role: "action" },
  "graph:actions.zoomIn": { role: "action" },
  "graph:actions.zoomOut": { role: "action" },
  "graph:disabledReasons.chooseConnectionWithSummary": {
    role: "disabled-reason",
  },
  "graph:disabledReasons.chooseItemWithTitle": { role: "disabled-reason" },
  "graph:disabledReasons.relatedItemUnavailable": {
    role: "disabled-reason",
  },
  "graph:disabledReasons.startingItemUnavailable": {
    role: "disabled-reason",
  },
  "graph:legend.accessibility.documentTypeFilters": { role: "accessibility" },
  "graph:legend.accessibility.moduleColors": { role: "accessibility" },
  "graph:legend.accessibility.recencyScale": { role: "accessibility" },
  "graph:legend.actions.addDocumentTypeFilter": { role: "action" },
  "graph:legend.actions.clearDocumentTypeFilters": { role: "action" },
  "graph:legend.actions.hideDocumentTypeLabels": { role: "action" },
  "graph:legend.actions.hideModuleLabels": { role: "action" },
  "graph:legend.actions.removeDocumentTypeFilter": { role: "action" },
  "graph:legend.actions.showDocumentTypeLabels": { role: "action" },
  "graph:legend.actions.showModuleLabels": { role: "action" },
  "graph:legend.labels.older": { role: "label" },
  "graph:legend.labels.recent": { role: "label" },
  "graph:shortcutGroups.workingSet": { role: "label" },
  "graph:labels.item": { role: "label" },
  "operations:actions.applySearchSettings": { role: "action" },
  "operations:actions.checkWorkspace": { role: "action" },
  "operations:actions.disableSearch": { role: "action" },
  "operations:actions.enableSearch": { role: "action" },
  "operations:actions.refreshSearch": { role: "action" },
  "operations:actions.showWorkspaceDetails": { role: "action" },
  "operations:feedback.applySearchSettings.failed": { role: "error-message" },
  "operations:feedback.applySearchSettings.running": { role: "status" },
  "operations:feedback.applySearchSettings.succeeded": { role: "status" },
  "operations:feedback.applySearchSettings.unavailable": {
    role: "error-message",
  },
  "operations:feedback.checkWorkspace.failed": { role: "error-message" },
  "operations:feedback.checkWorkspace.running": { role: "status" },
  "operations:feedback.checkWorkspace.succeeded": { role: "status" },
  "operations:feedback.disableSearch.failed": { role: "error-message" },
  "operations:feedback.disableSearch.running": { role: "status" },
  "operations:feedback.disableSearch.succeeded": { role: "status" },
  "operations:feedback.enableSearch.failed": { role: "error-message" },
  "operations:feedback.enableSearch.running": { role: "status" },
  "operations:feedback.enableSearch.succeeded": { role: "status" },
  "operations:feedback.enableSearch.unavailable": { role: "error-message" },
  "operations:feedback.refreshSearch.failed": { role: "error-message" },
  "operations:feedback.refreshSearch.running": { role: "status" },
  "operations:feedback.refreshSearch.succeeded": { role: "status" },
  "operations:feedback.refreshSearch.unavailable": { role: "error-message" },
  "operations:feedback.showWorkspaceDetails.failed": { role: "error-message" },
  "operations:feedback.showWorkspaceDetails.running": { role: "status" },
  "operations:feedback.showWorkspaceDetails.succeeded": { role: "status" },
  "projects:actions.add": { role: "action" },
  "projects:actions.checkProjectStatus": { role: "action" },
  "projects:actions.clearHistory": { role: "action" },
  "projects:actions.openPullRequest": { role: "action" },
  "projects:actions.prepareProjectTools": { role: "action" },
  "projects:actions.setUpProject": { role: "action" },
  "projects:actions.switch": { role: "action" },
  "projects:actions.switchWorktree": { role: "action" },
  "projects:actions.updateProject": { role: "action" },
  "projects:actions.updateProjectTools": { role: "action" },
  "projects:addDialog.accessibility.folderPath": { role: "accessibility" },
  "projects:addDialog.actions.add": { role: "action" },
  "projects:addDialog.actions.adding": { role: "status" },
  "projects:addDialog.actions.pickFolder": { role: "action" },
  "projects:addDialog.description": { role: "description" },
  "projects:addDialog.errors.addFailed": { role: "error-message" },
  "projects:addDialog.errors.alreadyAdded": { role: "error-message" },
  "projects:addDialog.errors.folderUnavailable": { role: "error-message" },
  "projects:addDialog.errors.notGitProject": {
    role: "error-message",
    allowedTerms: ["Git"],
  },
  "projects:addDialog.errors.pathRequired": { role: "error-message" },
  "projects:addDialog.fields.folder": { role: "label" },
  "projects:addDialog.placeholders.folderPath": { role: "label" },
  "projects:addDialog.title": { role: "label" },
  "projects:confirmations.replaceSetup.body": { role: "confirmation" },
  "projects:confirmations.replaceSetup.title": { role: "confirmation" },
  "projects:destructiveActions.replaceSetup": { role: "destructive-action" },
  "projects:disabledReasons.chooseWorktreeWithProjectFiles": {
    role: "disabled-reason",
  },
  "projects:disabledReasons.installRequiredProjectTools": {
    role: "disabled-reason",
  },
  "projects:disabledReasons.noSetupChangesNeeded": { role: "disabled-reason" },
  "projects:disabledReasons.prepareFolderAsGitProject": {
    role: "disabled-reason",
    allowedTerms: ["Git"],
  },
  "projects:disabledReasons.refreshProjectForPullRequest": {
    role: "disabled-reason",
  },
  "projects:disabledReasons.setUpProjectFirst": { role: "disabled-reason" },
  "projects:disabledReasons.waitForProjectStatus": { role: "disabled-reason" },
  "projects:folderBrowser.accessibility.filterFolders": { role: "accessibility" },
  "projects:folderBrowser.accessibility.folderOptionGitRepository": {
    role: "accessibility",
  },
  "projects:folderBrowser.accessibility.folderOptionHidden": {
    role: "accessibility",
  },
  "projects:folderBrowser.accessibility.folderOptionProject": {
    role: "accessibility",
  },
  "projects:folderBrowser.accessibility.folderOptionRegistered": {
    role: "accessibility",
  },
  "projects:folderBrowser.accessibility.folders": { role: "accessibility" },
  "projects:folderBrowser.accessibility.showHiddenFolders": {
    role: "accessibility",
  },
  "projects:folderBrowser.badges.alreadyAdded": { role: "label" },
  "projects:folderBrowser.badges.gitRepository": { role: "label" },
  "projects:folderBrowser.badges.hidden": { role: "label" },
  "projects:folderBrowser.badges.project": { role: "label" },
  "projects:folderBrowser.empty.noMatches": { role: "status" },
  "projects:folderBrowser.empty.noSubfolders": { role: "status" },
  "projects:folderBrowser.errors.readFailed": { role: "error-title" },
  "projects:folderBrowser.errors.readFailedHint": { role: "error-message" },
  "projects:folderBrowser.labels.filterFolders": { role: "label" },
  "projects:folderBrowser.labels.hidden": { role: "label" },
  "projects:folderBrowser.labels.roots": { role: "label" },
  "projects:folderBrowser.states.loading": { role: "status" },
  "projects:folderBrowser.states.truncated": { role: "status" },
  "projects:placesRail.labels.home": { role: "label" },
  "projects:placesRail.labels.places": { role: "accessibility" },
  "projects:placesRail.sections.drives": { role: "label" },
  "projects:placesRail.sections.projects": { role: "label" },
  "projects:placesRail.sections.recent": { role: "label" },
  "projects:workspaceIdentity.accessibility.choose": { role: "accessibility" },
  "projects:workspaceIdentity.accessibility.currentLocation": { role: "accessibility" },
  "projects:workspaceIdentity.accessibility.currentLocationInProject": {
    role: "accessibility",
  },
  "projects:workspaceIdentity.accessibility.currentLocationSwitching": {
    role: "accessibility",
  },
  "projects:workspaceIdentity.accessibility.currentLocationSwitchingInProject": {
    role: "accessibility",
  },
  "projects:workspaceIdentity.accessibility.recentProjects": { role: "accessibility" },
  "projects:workspaceIdentity.accessibility.removeRecent": { role: "accessibility" },
  "projects:workspaceIdentity.accessibility.rowActions": { role: "accessibility" },
  "projects:workspaceIdentity.accessibility.switchProject": { role: "accessibility" },
  "projects:workspaceIdentity.accessibility.switchWorktree": { role: "accessibility" },
  "projects:workspaceIdentity.accessibility.switchWorktreeInProject": {
    role: "accessibility",
  },
  "projects:workspaceIdentity.accessibility.switchUnnamedWorktreeInProject": {
    role: "accessibility",
  },
  "projects:workspaceIdentity.accessibility.unavailableProject": {
    role: "accessibility",
  },
  "projects:workspaceIdentity.accessibility.unavailableWorktree": {
    role: "accessibility",
  },
  "projects:workspaceIdentity.accessibility.worktreeList": { role: "accessibility" },
  "projects:workspaceIdentity.actions.addProject": { role: "action" },
  "projects:workspaceIdentity.actions.clearHistory": { role: "action" },
  "projects:workspaceIdentity.actions.collapseNavigation": { role: "action" },
  "projects:workspaceIdentity.actions.openProject": { role: "action" },
  "projects:workspaceIdentity.actions.removeFromHistory": { role: "action" },
  "projects:workspaceIdentity.actions.retry": { role: "action" },
  "projects:workspaceIdentity.counts.ahead": { role: "status" },
  "projects:workspaceIdentity.counts.behind": { role: "status" },
  "projects:workspaceIdentity.descriptions.switchProject": { role: "description" },
  "projects:workspaceIdentity.labels.current": { role: "label" },
  "projects:workspaceIdentity.labels.default": { role: "label" },
  "projects:workspaceIdentity.labels.noProjectName": { role: "label" },
  "projects:workspaceIdentity.labels.noWorktreeName": { role: "label" },
  "projects:workspaceIdentity.labels.noProjectFiles": { role: "label" },
  "projects:workspaceIdentity.labels.switching": { role: "label" },
  "projects:workspaceIdentity.labels.uncommittedChanges": { role: "label" },
  "projects:workspaceIdentity.labels.thisProjectWorktrees": { role: "label" },
  "projects:workspaceIdentity.labels.unnamedWorktreeInProject": { role: "label" },
  "projects:workspaceIdentity.labels.worktreeInProject": { role: "label" },
  "projects:workspaceIdentity.labels.worktreesInProject": { role: "label" },
  "projects:workspaceIdentity.sections.projects": { role: "label" },
  "projects:workspaceIdentity.sections.recent": { role: "label" },
  "projects:workspaceIdentity.sections.worktrees": { role: "label" },
  "projects:workspaceIdentity.states.degraded": { role: "status" },
  "projects:workspaceIdentity.states.loading": { role: "status" },
  "projects:workspaceIdentity.states.noRecent": { role: "status" },
  "projects:workspaceIdentity.states.noWorktrees": { role: "status" },
  "projects:workspaceIdentity.states.noWorktreesWithProjectFiles": { role: "status" },
  "projects:workspaceIdentity.states.onlyWorktree": { role: "status" },
  "projects:workspaceIdentity.states.switchFailed": { role: "error-message" },
  "projects:workspaceIdentity.states.worktreesFailed": { role: "error-message" },
  "projects:workspaceIdentity.titles.switchProject": { role: "label" },
  "projects:workspaceIdentity.titles.switchWorkspace": { role: "label" },
  "projects:provisioning.description": { role: "description" },
  "projects:provisioning.details.installRequiredProjectTools": {
    role: "description",
  },
  "projects:provisioning.details.prepareFolderAsGitProject": {
    role: "description",
    allowedTerms: ["Git"],
  },
  "projects:provisioning.progress": { role: "status" },
  "projects:provisioning.result.completed": { role: "status" },
  "projects:provisioning.result.failed": { role: "error-title" },
  "projects:provisioning.result.indeterminate": { role: "error-message" },
  "projects:provisioning.result.itemCount": { role: "status" },
  "projects:provisioning.result.status.created": { role: "status" },
  "projects:provisioning.result.status.failed": { role: "status" },
  "projects:provisioning.result.status.mixed": { role: "status" },
  "projects:provisioning.result.status.removed": { role: "status" },
  "projects:provisioning.result.status.restored": { role: "status" },
  "projects:provisioning.result.status.skipped": { role: "status" },
  "projects:provisioning.result.status.updated": { role: "status" },
  "projects:provisioning.result.status.upToDate": { role: "status" },
  "projects:provisioning.startFailed": { role: "error-message" },
  "projects:provisioning.statusUnavailable": { role: "error-title" },
  "projects:provisioning.title": { role: "label" },
  "projects:shortcutGroups.projects": { role: "label" },
  "settings:actions.useDarkTheme": { role: "action" },
  "settings:actions.useHighContrastTheme": { role: "action" },
  "settings:actions.useLightTheme": { role: "action" },
  "settings:actions.useSystemTheme": { role: "action" },
  "settings:groups.appearance": { role: "label" },
  "settings:groups.graph": { role: "label" },
  "settings:groups.keybindings": { role: "label" },
  "settings:fields.theme.label": { role: "label" },
  "settings:fields.theme.description": { role: "description" },
  "settings:fields.reduceMotion.label": { role: "label" },
  "settings:fields.reduceMotion.description": { role: "description" },
  "settings:fields.activitySectionFolds.label": { role: "label" },
  "settings:fields.activitySectionFolds.description": { role: "description" },
  "settings:fields.language.label": { role: "label" },
  "settings:fields.language.description": { role: "description" },
  "settings:fields.defaultGranularity.label": { role: "label" },
  "settings:fields.defaultGranularity.description": { role: "description" },
  "settings:fields.corpus.label": { role: "label" },
  "settings:fields.corpus.description": { role: "description" },
  "settings:fields.timelineDate.label": { role: "label" },
  "settings:fields.timelineDate.description": { role: "description" },
  "settings:fields.confidenceFloor.label": { role: "label" },
  "settings:fields.confidenceFloor.description": { role: "description" },
  "settings:fields.labelFilter.label": { role: "label" },
  "settings:fields.labelFilter.description": { role: "description" },
  "settings:fields.labelFilter.placeholder": { role: "label" },
  "settings:fields.graphControls.label": { role: "label" },
  "settings:fields.graphControls.description": { role: "description" },
  "settings:fields.shortcuts.label": { role: "label" },
  "settings:fields.shortcuts.description": { role: "description" },
  "settings:options.system": { role: "label" },
  "settings:options.light": { role: "label" },
  "settings:options.dark": { role: "label" },
  "settings:options.highContrast": { role: "label" },
  "settings:options.english": { role: "label" },
  "timeline:accessibility.dateField": { role: "accessibility" },
  "timeline:accessibility.loadingRange": { role: "accessibility" },
  "timeline:accessibility.rangeEnd": { role: "accessibility" },
  "timeline:accessibility.rangeStart": { role: "accessibility" },
  "timeline:accessibility.selectedRange": { role: "accessibility" },
  "timeline:actions.clearDateRange": { role: "action" },
  "timeline:actions.filterByCreationDate": { role: "action" },
  "timeline:actions.filterByCreationDateCurrent": { role: "action" },
  "timeline:actions.filterByEditDate": { role: "action" },
  "timeline:actions.filterByEditDateCurrent": { role: "action" },
  "timeline:actions.filterByUpdateDate": { role: "action" },
  "timeline:actions.filterByUpdateDateCurrent": { role: "action" },
  "timeline:actions.showLast24Hours": { role: "action" },
  "timeline:actions.showLast7Days": { role: "action" },
  "timeline:actions.showLast30Days": { role: "action" },
  "timeline:actions.showLast90Days": { role: "action" },
  "timeline:actions.viewProjectAtVersion": { role: "action" },
  "timeline:criteria.created": { role: "label" },
  "timeline:criteria.modified": { role: "label" },
  "timeline:criteria.stamped": { role: "label" },
  "timeline:descriptions.useCreationDateForRange": { role: "description" },
  "timeline:descriptions.useEditDateForRange": { role: "description" },
  "timeline:descriptions.useUpdateDateForRange": { role: "description" },
  "timeline:disabledReasons.codeFiles": { role: "disabled-reason" },
  "timeline:disabledReasons.chooseProject": { role: "disabled-reason" },
  "timeline:disabledReasons.current": { role: "disabled-reason" },
  "timeline:disabledReasons.modifiedUnavailable": {
    role: "disabled-reason",
  },
  "timeline:disabledReasons.refreshHistory": { role: "disabled-reason" },
  "timeline:disabledReasons.stampedUnavailable": {
    role: "disabled-reason",
  },
  "timeline:disabledReasons.switchToDocumentsForHistory": {
    role: "disabled-reason",
  },
  "timeline:labels.timeline": { role: "label" },
  "timeline:states.noDatedDocuments": { role: "status" },
  "timeline:states.noDatedFiles": { role: "status" },
  "timeline:states.rangeUnavailable": { role: "status" },
  "timeline:summaries.selectedRange": { role: "status" },
} as const satisfies Record<MessageKey, MessagePolicyEntry>;

export const IMPERATIVE_ACTION_VERBS = [
  "Add",
  "Allow",
  "Approve",
  "Apply",
  "Archive",
  "Ask",
  "Back",
  "Browse",
  "Cancel",
  "Check",
  "Choose",
  "Clear",
  "Close",
  "Collapse",
  "Confirm",
  "Continue",
  "Copy",
  "Create",
  "Delete",
  "Deny",
  "Disable",
  "Discard",
  "Edit",
  "Enable",
  "End",
  "Expand",
  "Find",
  "Filter",
  "Finish",
  "Fit",
  "Focus",
  "Hide",
  "Link",
  "Load",
  "Keep",
  "Move",
  "Open",
  "Pause",
  "Pick",
  "Pin",
  "Prepare",
  "Refresh",
  "Reject",
  "Reload",
  "Remove",
  "Rename",
  "Repair",
  "Replace",
  "Reset",
  "Reopen",
  "Resolve",
  "Resume",
  "Retry",
  "Restart",
  "Save",
  "Search",
  "Select",
  "Send",
  "Set",
  "Sign",
  "Show",
  "Sort",
  "Start",
  "Stop",
  "Submit",
  "Switch",
  "Try",
  "Unpin",
  "Update",
  "Use",
  "View",
  "Zoom",
] as const;

export const DESTRUCTIVE_ACTION_VERBS = [
  "Archive",
  "Delete",
  "Discard",
  "Remove",
  "Reject",
  "Replace",
] as const;

export const RECOVERY_VERBS = [
  "Add",
  "Ask",
  "Change",
  "Check",
  "Choose",
  "Close",
  "Copy",
  "Enter",
  "Move",
  "Open",
  "Prepare",
  "Refresh",
  "Reload",
  "Rename",
  "Reopen",
  "Review",
  "Resolve",
  "Return",
  "Retry",
  "Save",
  "Select",
  "Set",
  "Sign",
  "Switch",
  "Try",
  "Update",
  "Wait",
] as const;

export interface ProhibitedUiTerm {
  readonly id: string;
  readonly pattern: RegExp;
}

export const PROHIBITED_UI_TERMS: readonly ProhibitedUiTerm[] = Object.freeze([
  { id: "engine", pattern: /\bengine\b/iu },
  { id: "backend", pattern: /\bbackend\b/iu },
  { id: "frontend", pattern: /\bfrontend\b/iu },
  { id: "adapter", pattern: /\badapter\b/iu },
  { id: "token", pattern: /\btokens?\b/iu },
  { id: "identifier", pattern: /\bidentifiers?\b/iu },
  { id: "wire", pattern: /\bwire\b/iu },
  { id: "payload", pattern: /\bpayload\b/iu },
  { id: "schema", pattern: /\bschema(?:\s+key)?\b/iu },
  { id: "action-id", pattern: /\baction\s+id\b/iu },
  { id: "route", pattern: /\broute(?:\s+name)?\b/iu },
  { id: "query-cache", pattern: /\bquery\s+cache\b/iu },
  { id: "hydration", pattern: /\bhydrat(?:e|ed|es|ing|ion)\b/iu },
  { id: "provider", pattern: /\bprovider\b/iu },
  { id: "reducer", pattern: /\breducer\b/iu },
  { id: "component", pattern: /\bcomponent\b/iu },
  { id: "hook", pattern: /\bhook\b/iu },
  { id: "stack-trace", pattern: /\bstack\s+trace\b/iu },
  { id: "exception", pattern: /\bexception\b/iu },
  { id: "loopback", pattern: /\bloopback\b/iu },
  { id: "debug", pattern: /\bdebug(?:ging)?\b/iu },
  { id: "development", pattern: /\bdevelopment\b/iu },
  { id: "development-mode", pattern: /\b(?:development|dev)\s+mode\b/iu },
  { id: "development-control", pattern: /\bdevelopment\s+controls?\b/iu },
  { id: "not-implemented", pattern: /\bnot\s+implemented\b/iu },
  { id: "implementation", pattern: /\bimplementation\b/iu },
  {
    id: "implementation-difficulty",
    pattern:
      /\b(?:difficult|hard|complex|complicated)\s+to\s+(?:implement|support|fix|understand)\b/iu,
  },
  { id: "vault-bearing", pattern: /\bvault-bearing\b/iu },
  { id: "workspace-map", pattern: /\bworkspace\s+map\b/iu },
  { id: "semantic-search", pattern: /\bsemantic\s+search\b/iu },
  { id: "rag", pattern: /\bRAG\b/u },
  { id: "sse", pattern: /\bSSE\b/u },
  { id: "tier", pattern: /\btier(?:s)?\b/iu },
  { id: "scope", pattern: /\bscope\b/iu },
  { id: "endpoint", pattern: /\bendpoint\b/iu },
  { id: "service", pattern: /\bservice\b/iu },
  { id: "command-line", pattern: /\bcommand\s+line\b/iu },
  { id: "internal", pattern: /\binternal\b/iu },
  { id: "webgl", pattern: /\bWebGL\b/iu },
  { id: "gpu", pattern: /\bGPU\b/iu },
  { id: "cli", pattern: /\bCLI\b/iu },
  { id: "parameter", pattern: /\bparameter\b/iu },
  { id: "physics", pattern: /\bphysics\b/iu },
  { id: "graph-theory", pattern: /\bgraph\s+theory\b/iu },
  { id: "node", pattern: /\bnode\b/iu },
  { id: "internal-package", pattern: /\bvaultspec-(?:core|rag)\b/iu },
]);

export type MessagePolicyIssueCode =
  | "empty"
  | "too-long"
  | "em-dash"
  | "nested-message"
  | "raw-key"
  | "raw-placeholder"
  | "diagnostic"
  | "prohibited-term"
  | "term-casing"
  | "sentence-case"
  | "title-case"
  | "non-imperative-action"
  | "non-destructive-verb"
  | "action-punctuation"
  | "not-actionable";

export interface MessagePolicyIssue {
  readonly code: MessagePolicyIssueCode;
  readonly detail?: string;
}

export type StaticMessagePart =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "value"; readonly name: string };

const INTERPOLATION_TOKEN = /\{\{\s*([a-z][a-zA-Z0-9]*)(?:\s*,\s*number)?\s*\}\}/gu;
const RAW_PLACEHOLDER = /\{\{|\}\}|\$\{|%\{/u;
const RAW_MESSAGE_KEY =
  /\b([a-z][a-zA-Z0-9]*):[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)*\b/gu;
const DIAGNOSTIC_PATTERNS = [
  /\b(?:Error|TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError):(?=\s|$)/u,
  /(?:^|\s)at\s+[\w.[\]<>]+\s*\([^\n)]+:\d+:\d+\)/u,
  /(?:[A-Za-z]:\\|\/(?:home|Users|var|tmp|src)\/)[^\s]+/u,
  /(?:^|\s)(?:\.{0,2}[\\/])?(?:src|frontend|engine|node_modules|\.vault|\.git)[\\/][^\s]+/u,
  /\b(?:localhost|127\.0\.0\.1|::1)(?::\d+)?\b/iu,
  /(?:^|\s)--[a-z][a-z0-9-]*(?:\s|$)/u,
  /(?:^|[`$]\s*|\s)(?:npm\s+run|npx|pnpm|yarn|cargo|rustc|node|git|vaultspec(?:-core)?)\s+[a-z][a-z0-9:_-]*/u,
] as const;
const WORD = /\p{L}[\p{L}\p{M}'’-]*/gu;
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+/u;
const RECOVERY_CLAUSE_BOUNDARY = /(?:[.!?;]\s+|,\s+(?:then\s+)?)/u;
const VALUE_MARKER = "\uFFFC";
const RECOVERY_OBJECT_LEADS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "another",
  "data",
  "it",
  "our",
  "that",
  "the",
  "them",
  "these",
  "this",
  "those",
  "your",
]);
const RECOVERY_PREPOSITIONS: ReadonlySet<string> = new Set([
  "after",
  "before",
  "for",
  "from",
  "in",
  "on",
  "to",
  "with",
]);
const RECOVERY_FAILURE_STATEMENT =
  /\b(?:(?:did|does|do|will|would|could|can|is|was|were|has|have|had)\s+(?:not\s+)?(?:work|fail|failed|unavailable|disabled)|(?:cannot|can't|won't)\s+(?:work|continue|open|reload|retry)|failed|fails|failure|unavailable|disabled)\b/iu;

const IMPERATIVE_VERB_SET: ReadonlySet<string> = new Set(IMPERATIVE_ACTION_VERBS);
const DESTRUCTIVE_VERB_SET: ReadonlySet<string> = new Set(DESTRUCTIVE_ACTION_VERBS);
const RECOVERY_VERB_SET: ReadonlySet<string> = new Set(RECOVERY_VERBS);
const MESSAGE_NAMESPACE_SET: ReadonlySet<string> = new Set(
  MESSAGE_KEYS.map((key) => key.slice(0, key.indexOf(":"))),
);

export function staticMessageParts(template: string): readonly StaticMessagePart[] {
  const parts: StaticMessagePart[] = [];
  let cursor = 0;
  for (const match of template.matchAll(INTERPOLATION_TOKEN)) {
    const index = match.index;
    if (index > cursor) {
      parts.push({ kind: "text", value: template.slice(cursor, index) });
    }
    parts.push({ kind: "value", name: match[1]! });
    cursor = index + match[0].length;
  }
  if (cursor < template.length) {
    parts.push({ kind: "text", value: template.slice(cursor) });
  }
  return Object.freeze(parts);
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function termPattern(term: ApprovedUiTerm): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escapePattern(term)}(?![\\p{L}\\p{N}])`,
    "giu",
  );
}

function issue(
  issues: MessagePolicyIssue[],
  code: MessagePolicyIssueCode,
  detail?: string,
): void {
  if (issues.some((item) => item.code === code && item.detail === detail)) return;
  issues.push(detail === undefined ? { code } : { code, detail });
}

function firstWord(value: string): string | null {
  WORD.lastIndex = 0;
  return WORD.exec(value)?.[0] ?? null;
}

function wordsIn(value: string): readonly RegExpMatchArray[] {
  WORD.lastIndex = 0;
  return [...value.matchAll(WORD)];
}

function containsRawMessageKey(value: string): boolean {
  return [...value.matchAll(RAW_MESSAGE_KEY)].some((match) =>
    MESSAGE_NAMESPACE_SET.has(match[1]!),
  );
}

function isActionableRecoveryClause(clause: string): boolean {
  const trimmed = clause.trimStart();
  if (trimmed.length === 0 || trimmed.startsWith(VALUE_MARKER)) return false;

  const verb = firstWord(trimmed);
  if (verb === null) return false;
  const canonicalVerb = `${verb[0]!.toLocaleUpperCase("en")}${verb.slice(1)}`;
  if (!RECOVERY_VERB_SET.has(canonicalVerb)) return false;

  const verbEnd = trimmed.indexOf(verb) + verb.length;
  const complement = trimmed.slice(verbEnd).trimStart();
  if (complement.length === 0) return false;
  if (RECOVERY_FAILURE_STATEMENT.test(complement)) return false;
  if (complement.startsWith(VALUE_MARKER)) return true;

  const words = wordsIn(complement).map((match) => match[0].toLocaleLowerCase("en"));
  const lead = words[0];
  if (lead === "or") {
    return isActionableRecoveryClause(complement.slice(words[0]!.length));
  }
  if (canonicalVerb === "Refresh" && lead === "data") return true;
  if (lead === "again") {
    return words.length === 1 || RECOVERY_PREPOSITIONS.has(words[1]!);
  }
  if (lead !== undefined && RECOVERY_OBJECT_LEADS.has(lead)) {
    return words.length >= 2 || complement.includes(VALUE_MARKER);
  }
  if (lead !== undefined && RECOVERY_PREPOSITIONS.has(lead)) {
    return words.length >= 2 || complement.includes(VALUE_MARKER);
  }
  return false;
}

function sentenceCaseIssues(
  value: string,
  approvedTerms: readonly ApprovedUiTerm[],
  issues: MessagePolicyIssue[],
): void {
  const protectedText = approvedTerms.reduce(
    (text, term) =>
      text.replace(
        termPattern(term),
        (match) => `${VALUE_MARKER}${" ".repeat(Math.max(0, match.length - 1))}`,
      ),
    value,
  );

  for (const sentence of protectedText.split(SENTENCE_BOUNDARY)) {
    const trimmed = sentence.trimStart();
    if (trimmed.length === 0) continue;

    if (!trimmed.startsWith(VALUE_MARKER)) {
      const initial = trimmed.match(/\p{L}/u)?.[0];
      if (
        initial !== undefined &&
        initial.toLocaleUpperCase("en") !== initial &&
        initial.toLocaleLowerCase("en") === initial
      ) {
        issue(issues, "sentence-case");
      }
    }

    const words = wordsIn(trimmed);
    const firstInteriorWord = trimmed.startsWith(VALUE_MARKER) ? 0 : 1;
    for (let index = firstInteriorWord; index < words.length; index += 1) {
      const word = words[index]![0];
      const first = word[0]!;
      if (
        first.toLocaleUpperCase("en") === first &&
        first.toLocaleLowerCase("en") !== first &&
        /\p{Ll}/u.test(word.slice(1))
      ) {
        issue(issues, "title-case", word);
      }
    }
  }
}

function roleBounds(role: MessageRole): { chars: number; words: number } {
  switch (role) {
    case "action":
    case "destructive-action":
      return { chars: 60, words: 6 };
    case "label":
    case "proper-name":
    case "status":
    case "error-title":
    case "disabled-reason":
      return { chars: 80, words: 10 };
    case "error-message":
    case "confirmation":
      return { chars: 200, words: 32 };
    case "description":
    case "accessibility":
      return { chars: 240, words: 40 };
  }
}

export function validateEnglishMessage(
  key: MessageKey,
  template: string,
): readonly MessagePolicyIssue[] {
  const issues: MessagePolicyIssue[] = [];
  const policy: MessagePolicyEntry = ENGLISH_MESSAGE_POLICY[key];
  const parts = staticMessageParts(template);
  const staticText = parts
    .map((part) => (part.kind === "text" ? part.value : VALUE_MARKER))
    .join("");
  const literalText = parts
    .filter(
      (part): part is Extract<StaticMessagePart, { kind: "text" }> =>
        part.kind === "text",
    )
    .map((part) => part.value)
    .join(" ");

  // A proper-name message may be a pure interpolation pass-through (e.g. a plan
  // step's own name rendered through the localization boundary) — the template
  // carries a value token and no literal copy, which is not an empty message.
  const interpolationOnly =
    parts.some((part) => part.kind === "value") && literalText.trim().length === 0;
  if (
    template.trim().length === 0 ||
    (literalText.trim().length === 0 &&
      !(policy.role === "proper-name" && interpolationOnly))
  ) {
    issue(issues, "empty");
  }

  const bounds = roleBounds(policy.role);
  const wordCount = wordsIn(staticText).length;
  if (template.length > bounds.chars || wordCount > bounds.words) {
    issue(issues, "too-long");
  }
  if (literalText.includes("\u2014")) issue(issues, "em-dash");
  if (literalText.includes("$t(")) issue(issues, "nested-message");
  if (containsRawMessageKey(literalText)) {
    issue(issues, "raw-key");
  }
  if (RAW_PLACEHOLDER.test(literalText)) issue(issues, "raw-placeholder");
  if (DIAGNOSTIC_PATTERNS.some((pattern) => pattern.test(literalText))) {
    issue(issues, "diagnostic");
  }

  for (const term of PROHIBITED_UI_TERMS) {
    if (term.pattern.test(literalText)) issue(issues, "prohibited-term", term.id);
  }

  const approvedTerms = policy.allowedTerms ?? APPROVED_UI_TERMS;
  for (const term of approvedTerms) {
    for (const match of literalText.matchAll(termPattern(term))) {
      if (match[0] !== term) issue(issues, "term-casing", term);
    }
  }
  if (policy.role !== "proper-name") {
    sentenceCaseIssues(staticText, approvedTerms, issues);
  }

  if (policy.role === "action" || policy.role === "destructive-action") {
    const verb = firstWord(staticText);
    if (verb === null || !IMPERATIVE_VERB_SET.has(verb)) {
      issue(issues, "non-imperative-action");
    }
    if (/[.!?]\s*$/u.test(staticText)) issue(issues, "action-punctuation");
    if (
      policy.role === "destructive-action" &&
      (verb === null || !DESTRUCTIVE_VERB_SET.has(verb))
    ) {
      issue(issues, "non-destructive-verb");
    }
  }

  if (policy.role === "error-message" || policy.role === "disabled-reason") {
    const clauses = staticText.split(RECOVERY_CLAUSE_BOUNDARY);
    const actionable = clauses.some(isActionableRecoveryClause);
    if (!actionable) issue(issues, "not-actionable");
  }

  return Object.freeze(issues);
}
