---
tags:
  - '#adr'
  - '#frontend-language-authority'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - "[[2026-07-14-frontend-localization-research]]"
---

# `frontend-language-authority` adr: `Serve semantic settings metadata and reconcile language through engine authority` | (**status:** `proposed`)

## Problem Statement

The accepted localization decision permits a persisted locale only through the engine
settings registry, while the accepted settings decision currently serves resolved
English labels, descriptions, groups, and enum labels as UI hints. Adding language
selection directly to that shape would make English part of the wire contract,
duplicate display authority, and risk exposing schema tokens during a staged migration.
The application also needs the selected language before first paint, although
authoritative settings arrive asynchronously.

This decision defines the semantic settings wire, persisted language representation,
first-paint cache, reconciliation with engine truth, and safe migration order. It
refines localization D11 and the settings UI-hint contract without moving schema
authority out of the engine.

## Considerations

- The engine registry remains authoritative for setting identity, type, default,
  constraints, scope eligibility, control kind, grouping, order, and persisted value.
- Frontend catalogs remain authoritative for every user-facing word. Stable semantic
  IDs may cross the wire, but resolved English may not.
- A semantic ID is presentation identity, not a localization key. The frontend maps it
  exhaustively to a typed descriptor and never passes a wire value directly to translation.
- Initial language must be available synchronously to prevent a source-language
  first-frame flash, but the cache cannot become an independent preference authority.
- Unknown metadata and unsupported locales must fail to safe copy and the source locale,
  never raw IDs, diagnostics, or development state.

## Considered options

- **Dual-wire English compatibility.** Add semantic metadata while retaining English
  fields. This eases mixed-version rollout but preserves two presentation authorities.
  Rejected.
- **Engine semantic IDs first.** Switch the engine before frontend adaptation. Existing
  frontend code could render semantic IDs or manufactured token labels. Rejected.
- **Compatibility-first coordinated break.** Teach the frontend to consume semantic
  metadata and safely absorb the known legacy schema, migrate rendering to catalogs,
  then switch the engine wire. Chosen because every intermediate visible state is safe.
- **Versioned schema endpoints.** Serve separate legacy and semantic representations.
  This supports independently deployed clients but creates a long-lived compatibility
  surface. Deferred unless independent deployment becomes a product requirement.

## Constraints

- Stores remain the sole wire client. The platform locale controller cannot fetch
  settings, import store hooks, or inspect tiers.
- The engine and frontend ship as one application unit for the coordinated schema break.
  Supporting an independently deployed older frontend requires explicit versioning.
- Locale values are bounded canonical identifiers supported by bundled catalogs.
  Internal runtime locales, malformed values, and unsupported values are rejected.
- Settings writes continue through the existing validated engine path. Reconciliation
  does not silently rewrite an invalid historical value.
- The dashboard-settings and localization parent systems are accepted and stable. This
  decision refines their presentation and reconciliation seam without changing storage
  or settings authority.

## Implementation

**D1 - Semantic settings presentation wire.** The engine serves bounded semantic
display IDs for setting concepts, groups, and enum members. Resolved labels,
descriptions, group wording, placeholder wording, and manufactured enum labels leave
the wire. Enum presentation metadata covers every declared member exactly.

**D2 - Frontend-owned message resolution.** The frontend adapter normalizes the semantic
schema and recognizes the bounded known legacy schema during transition without retaining
its English as display copy. Rendering resolves semantic IDs through an exhaustive typed
descriptor map. Unknown IDs use safe generic descriptors or suppress optional detail;
they are never title-cased, humanized, or displayed raw.

**D3 - Engine-owned language preference.** The registry declares global-only `language`
as an enum whose members are `system` followed by every shipped canonical locale, with
default `system`. The engine validates exact membership and scope. Adding or removing a
locale requires coordinated catalog, runtime, and registry updates.

**D4 - Deterministic system resolution.** For `system`, bounded canonical browser
preferences are examined in order. An exact shipped locale wins, then the first shipped
locale with the same base language, then the source locale. The resolved locale is never
persisted in place of `system`. Browser language changes are observed only while
`system` is active.

**D5 - Synchronous cache as a first-paint hint.** A bounded local cache stores only a
validated preference token. Runtime construction reads it synchronously and initializes
directly with the resolved shipped locale before document binding or React mount. The
cache grants no write authority over the engine.

**D6 - Engine truth reconciliation.** After schema and settings resolve through stores,
a thin application bridge supplies the effective global preference to a framework-free,
wire-free controller. Engine truth wins over the cache and active locale. Unsupported
historical values apply the source locale without silently rewriting persistence.
Locale-change races use latest-request semantics.

**D7 - Quiet safe failure.** Cache, browser-language, runtime-change, and reconciliation
failures use the source locale and structured diagnostics only. They produce no visible
error, raw exception, semantic ID, or development metadata.

**D8 - Compatibility-safe execution order.** Implementation order is S09, S11, S08,
S10, S12: adapt frontend wire types and selectors; render settings through catalogs;
switch the engine registry and add language; install synchronous reconciliation; then
prove the real contract. This order is binding because changing it creates an unsafe
intermediate UI.

## Rationale

The localization research requires stable identity to cross the wire while display
vocabulary stays frontend-owned. Semantic IDs preserve the settings decision that one
engine declaration drives validation and control structure without making resolved
English part of that declaration's wire contract. Compatibility-first frontend work
keeps both the legacy and semantic schema safe during a coordinated release.

A synchronous cache is necessary for first paint, as already established for theme,
but authoritative reconciliation prevents it from becoming a second preference system.

## Consequences

- Settings structure and persistence remain engine-owned while rendered language becomes
  catalog-owned.
- The settings wire no longer carries resolved English, and locale changes require no
  translated store state or data refetch.
- Adding a locale becomes a coordinated catalog, runtime, and engine-enum contract change.
- First paint uses a synchronous hint and may transition once if authoritative state
  differs; this is reconciliation, not a source-language flash.
- Mixed independent engine/frontend deployment is unsupported without explicit endpoint
  versioning.
- The frontend must maintain exhaustive semantic display mappings and safe unknown
  behavior. Generic token humanization is prohibited.
- Historical unsupported values remain stored until the user selects a valid value, but
  cannot affect rendered language or leak into UI.
