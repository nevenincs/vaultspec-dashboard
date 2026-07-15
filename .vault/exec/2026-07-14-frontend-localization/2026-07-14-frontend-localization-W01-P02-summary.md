---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# `frontend-localization` `W01.P02` summary

Phase W01.P02 established one engine-owned language preference and a frontend-owned
localized settings vocabulary. Semantic identity crosses the wire, catalogs own every
visible label, and a bounded synchronous cache reconciles to engine truth after startup.

## Files

- Modified: `engine/crates/vaultspec-session/src/settings_schema.rs`, `engine/crates/vaultspec-session/src/lib.rs`
- Modified: `engine/crates/vaultspec-api/src/routes/session.rs`, `engine/tests/tests/conformance.rs`
- Modified: `frontend/src/stores/server/engine/statusTypes.ts`, `frontend/src/stores/server/liveAdapters/session.ts`, `frontend/src/stores/server/settingsSelectors.ts`, `frontend/src/stores/server/queries/settings.ts`
- Modified: `frontend/src/app/settings/SettingsDialog.tsx`, `frontend/src/app/settings/settingsEffects.ts`, `frontend/src/app/settings/controls`
- Modified: `frontend/src/stores/view/settingsControls.ts`, `frontend/src/locales/en/index.ts`, `frontend/src/localization/testing/resources.ts`, `frontend/src/localization/messagePolicy.ts`
- Created: `frontend/src/locales/en/settings.ts`, `frontend/src/stores/view/settingsPresentation.ts`
- Created: `frontend/src/platform/localization/localeController.ts`, `frontend/src/platform/localization/runtimeFactory.test.ts`
- Updated and created the five W01.P02 Step Records and this Phase Summary.

## Description

- Engine settings metadata now serves bounded semantic identities without resolved English.
- Language is global-only, defaults to System, and accepts shipped English.
- The frontend adapter recognizes exact semantic and legacy contracts without retaining copy.
- Settings groups, fields, descriptions, placeholders, enum options, and accessibility labels resolve through typed catalogs.
- Startup uses a bounded synchronous locale hint and reconciles through the existing store bridge.
- Latest-request semantics, System browser resolution, listener cleanup, and quiet source fallback are proven with real behavior.
- A live-engine test proves authoritative preference and cache reconciliation end to end.

## Verification

Sol performed architecture and independent code reviews; Terra mapped, hardened, and
verified the mechanical rollout and live integration. Real English, French, and Arabic
resources prove locale behavior without adding test locales to production. Focused Rust,
frontend, and live-engine tests, workspace Clippy, the complete frontend lint recipe,
TypeScript, formatting, message policy, scanner, and diff checks passed. Tests use no
mocks, fakes, stubs, patches, skips, or expected failures. The scanner remained clean at
1,151 findings with no allowlist change.
