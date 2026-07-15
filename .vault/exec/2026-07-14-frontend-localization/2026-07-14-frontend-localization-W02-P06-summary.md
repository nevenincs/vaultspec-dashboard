---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# `frontend-localization` `W02.P06` summary

Phase W02.P06 established exact localized vocabularies for browser modes, activity-panel
tabs, timeline dates, document types, action feedback, rail sorting, and categories.
Every contract keeps raw identity separate from presentation and rejects unknown display
values instead of humanizing or exposing them.

## Files

- Modified: `frontend/scripts/localization-allowlist.json`
- Modified: `frontend/src/app/chrome/ShellResizeHandle.tsx`
- Modified: `frontend/src/app/left/BrowserModeToggle.tsx`
- Modified: `frontend/src/app/left/BrowserRegion.tsx`
- Modified: `frontend/src/app/kit/category.ts`, `frontend/src/app/kit/index.ts`
- Modified: `frontend/src/app/menu/ContextMenuHost.tsx`, `frontend/src/app/menu/ContextMenuHost.render.test.tsx`, `frontend/src/app/menu/seamTransit.test.tsx`
- Modified: `frontend/src/app/menus/backgroundMenu.test.ts`
- Modified: `frontend/src/app/palette/CommandPalette.test.ts`
- Modified: `frontend/src/app/right/rail.test.ts`, `frontend/src/app/right/rightRailActions.test.tsx`
- Modified: `frontend/src/app/shell/IconRail.tsx`
- Modified: `frontend/src/app/stage/DockWorkspace.tsx`
- Modified: `frontend/src/app/timeline/TimelineRangeSelector.tsx`, `frontend/src/app/timeline/menus/timelineFilterActions.ts`, `frontend/src/app/timeline/timelineDateCriterion.ts`
- Modified: `frontend/src/locales/en/common.ts`, `frontend/src/locales/en/documents.ts`, `frontend/src/locales/en/features.ts`, `frontend/src/locales/en/index.ts`
- Modified: `frontend/src/localization/catalogKeys.test.ts`, `frontend/src/localization/messagePolicy.ts`, `frontend/src/localization/testing/resources.ts`
- Modified: `frontend/src/stores/server/docTypeVocabulary.ts`, `frontend/src/stores/server/menuActionOutcome.ts`
- Modified: `frontend/src/stores/server/docTypeVocabulary.test.ts`, `frontend/src/stores/server/menuActionOutcome.test.ts`
- Modified: `frontend/src/stores/view/actionFeedback.ts`, `frontend/src/stores/view/browserMode.ts`, `frontend/src/stores/view/commandPaletteCommands.ts`, `frontend/src/stores/view/filterSidebar.test.ts`, `frontend/src/stores/view/leftRailKeybindings.ts`, `frontend/src/stores/view/railSort.ts`, `frontend/src/stores/view/rightRailKeybindings.ts`, `frontend/src/stores/view/shellLayout.ts`
- Modified: `frontend/src/stores/view/actionFeedback.test.ts`, `frontend/src/stores/view/browserMode.test.ts`, `frontend/src/stores/view/leftRailKeybindings.localization.test.ts`, `frontend/src/stores/view/shellLayout.test.ts`
- Modified: `frontend/src/app/left/BrowserModeToggle.render.test.tsx`, `frontend/src/app/left/BrowserRegion.render.test.tsx`, `frontend/src/app/shell/IconRail.render.test.tsx`, `frontend/src/app/timeline/TimelineRangeSelector.criterion.render.test.tsx`
- Modified: `frontend/src/app/kit/category.test.ts`
- Created: `frontend/src/app/chrome/ShellResizeHandle.render.test.tsx`
- Created: `frontend/src/app/stage/DockWorkspace.localization.render.test.tsx`
- Created: `frontend/src/app/timeline/timelineDateCriterion.test.ts`
- Created: `frontend/src/locales/en/timeline.ts`
- Created: `frontend/src/stores/view/railSort.test.ts`
- Updated and created the seven W02.P06 Step Records and this Phase Summary.

## Description

- Browser concepts resolve as Documents and Files without translating raw mode IDs.
- Activity-panel and shell-layout wording no longer exposes right-rail implementation terms.
- Timeline criteria use Created, Edited, and Updated with complete actionable messages.
- Document types use one exact six-item catalog vocabulary and safe generic Document copy.
- Menu feedback carries typed result conditions instead of stored English or raw outcomes.
- Rail sorting uses complete localized labels, actions, and accessibility messages.
- Categories reuse document-type descriptors and add only Code and Features.

## Verification

Every step received an independent Sol review and a Terra rollout or verification pass.
Real English, French, and Arabic tests cover catalog resolution and locale reactivity.
The complete frontend lint recipe passed at phase close. The closing S35 through S38,
S221, and S222 sequence reduced scanner findings from 1,184 to 1,151 with no additions;
S39 separately removed six earlier exemptions. Tests use production code and real runtime
or storage behavior without mocks, fakes, stubs, patches, skips, or expected failures.
